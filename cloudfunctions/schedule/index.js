// schedule 云函数：排课候选老师筛选
const { db, _, COLLECTIONS } = require('./common/db')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, todayStr } = require('./common/timeUtils')
const { filterCandidates, BLOCKING_STATUS, buildOccurrences } = require('./common/scheduleCore')

const teachers = db.collection(COLLECTIONS.teachers)
const users = db.collection(COLLECTIONS.users)
const availabilities = db.collection(COLLECTIONS.availabilities)
const sessions = db.collection(COLLECTIONS.sessions)

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 分页拉取全部记录（绕过单次 1000 条上限）
async function queryAll(collection, where) {
  const all = []
  let offset = 0
  while (true) {
    const { data } = await collection.where(where).skip(offset).limit(1000).get()
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
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
    if (!(weekday >= 0 && weekday <= 6)) bad('请选择星期几')
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

  // 1. 可带该校区的老师
  const teacherDocs = await queryAll(teachers, { campuses: req.campusId })
  if (!teacherDocs.length) return { list: [] }
  const teacherIds = teacherDocs.map(t => t.userId)

  // 2. 可用时段 + 占用 session（只取系列涉及的日期）
  const dates = [...new Set(buildOccurrences(req).map(o => o.date))]
  const [slots, busySessions, userDocs] = await Promise.all([
    queryAll(availabilities, { teacherId: _.in(teacherIds) }),
    queryAll(sessions, {
      teacherId: _.in(teacherIds),
      date: _.in(dates),
      status: _.in(BLOCKING_STATUS)
    }),
    queryAll(users, { _id: _.in(teacherIds), role: 'teacher', status: 'active' })
  ])

  const slotsBy = {}
  for (const s of slots) (slotsBy[s.teacherId] = slotsBy[s.teacherId] || []).push(s)
  const sessionsBy = {}
  for (const s of busySessions) (sessionsBy[s.teacherId] = sessionsBy[s.teacherId] || []).push(s)
  const activeIds = new Set(userDocs.map(u => u._id))

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
  for (const u of userDocs) nameBy[u._id] = u.name
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
