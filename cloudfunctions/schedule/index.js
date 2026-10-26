// schedule 云函数：排课候选老师筛选
const { F, queryAll } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, todayStr } = require('./common/timeUtils')
const { filterCandidates, BLOCKING_STATUS, buildOccurrences } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 入参校验，返回归一化的需求对象
function validateRequirement(event) {
  const { campusId, type, startTime } = event
  if (!campusId) bad('请选择校区')
  if (!isValidTimeStr(startTime)) bad('开始时间格式不正确')
  const startMin = toMinutes(startTime)

  if (type === 'trial') {
    if (!isValidDateStr(event.date)) bad('请选择上课日期')
    const endMin = startMin + 30 // 体验课固定 30 分钟
    if (endMin > 1440) bad('上课时段不能跨天')
    return {
      campusId, type, date: event.date, startTime,
      duration: 30, fromDate: todayStr()
    }
  }
  if (type === 'regular') {
    const weekday = Number(event.weekday)
    if (!(weekday >= 0 && weekday <= 6)) bad('星期几不正确')
    const duration = Number(event.duration)
    if (![60, 90, 120].includes(duration)) bad('单次时长只能选 1h / 1.5h / 2h')
    const totalSessions = Number(event.totalSessions)
    if (!(Number.isInteger(totalSessions) && totalSessions >= 1 && totalSessions <= 100)) {
      bad('总次数需为 1-100 的整数')
    }
    if (startMin + duration > 1440) bad('上课时段不能跨天')
    return {
      campusId, type, weekday, startTime, duration,
      totalSessions, fromDate: todayStr()
    }
  }
  bad('课程类型不正确')
}

/**
 * 筛选候选老师
 * 入参：{ campusId, type:'trial'|'regular', date?, weekday?, startTime, duration?, totalSessions? }
 * 返回：{ list: [{ teacherId, name, campuses }] }（不排序，保持数据库返回顺序）
 */
async function filterTeachers(event) {
  requireAuth(event, 'admin')
  const req = validateRequirement(event)

  // 1. 全量老师，JS 过滤可带该校区（campuses 为 jsonb 数组，量小无需数据库包含查询）
  const allTeachers = await queryAll('teachers')
  const teacherDocs = allTeachers.filter(t => (t.campuses || []).includes(req.campusId))
  if (!teacherDocs.length) return { list: [] }
  const teacherIds = teacherDocs.map(t => t.userId)

  // 2. 可用时段 + 占用 session（只取系列涉及的日期）
  const dates = [...new Set(buildOccurrences(req).map(o => o.date))]
  const [slots, busySessions, userDocs] = await Promise.all([
    queryAll('availabilities', { teacherId: F.in(teacherIds) }),
    queryAll('sessions', {
      teacherId: F.in(teacherIds),
      date: F.in(dates),
      status: F.in(BLOCKING_STATUS)
    }),
    queryAll('users', { id: F.in(teacherIds), role: 'teacher', status: 'active' })
  ])

  const slotsBy = {}
  for (const s of slots) (slotsBy[s.teacherId] = slotsBy[s.teacherId] || []).push(s)
  const sessionsBy = {}
  for (const s of busySessions) (sessionsBy[s.teacherId] = sessionsBy[s.teacherId] || []).push(s)
  const activeIds = new Set(userDocs.map(u => u.id))

  // 3. 组装候选并执行核心筛选
  const candidates = teacherDocs
    .filter(t => activeIds.has(t.userId))
    .map(t => ({
      teacherId: t.userId,
      campuses: t.campuses || [],
      slots: slotsBy[t.userId] || [],
      sessions: sessionsBy[t.userId] || []
    }))
  const passedIds = new Set(filterCandidates(req, candidates))

  // 4. 返回通过者的展示信息（顺序保持数据库返回顺序）
  const nameBy = {}
  for (const u of userDocs) nameBy[u.id] = u.name
  const list = teacherDocs
    .filter(t => passedIds.has(t.userId))
    .map(t => ({ teacherId: t.userId, name: nameBy[t.userId] || '', campuses: t.campuses || [] }))
  return { list }
}

const handlers = { filterTeachers }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
