// course 云函数：排课发起、老师确认/拒绝、课表查询、管理端待办
const { F, queryAll, insertOne, updateById } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, toTimeStr, todayStr } = require('./common/timeUtils')
const { filterCandidates, buildOccurrences, BLOCKING_STATUS, sessionConflictsWithOcc } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 创建前校验：老师必须在候选筛选中通过（防止绕过筛选直接调用）
async function assertTeacherEligible(req, teacherId) {
  const tRows = await queryAll('teachers', { userId: teacherId }, { limit: 1 })
  if (!tRows.length) bad('老师不存在')
  const dates = [...new Set(buildOccurrences(req).map(o => o.date))]
  const [slots, busy] = await Promise.all([
    queryAll('availabilities', { teacherId }),
    queryAll('sessions', { teacherId, date: F.in(dates), status: F.in(BLOCKING_STATUS) })
  ])
  const passed = filterCandidates(req, [{
    teacherId,
    campuses: tRows[0].campuses || [],
    slots,
    sessions: busy
  }])
  if (!passed.length) bad('该老师不满足排课条件（校区/时间/冲突校验未通过）')
}

async function createCourseSessions(courseId, req, teacherId, studentId) {
  const occurrences = buildOccurrences(req)
  for (const occ of occurrences) {
    await insertOne('sessions', {
      courseId,
      teacherId,
      campusId: req.campusId,
      date: occ.date,
      startTime: toTimeStr(occ.startMin),
      endTime: toTimeStr(occ.endMin),
      status: 'pending'
    })
  }
  return occurrences.length
}

// 发起体验课（30分钟）
async function createTrial(event) {
  requireAuth(event, 'admin')
  const { studentId, teacherId, campusId, date, startTime } = event
  if (!studentId || !teacherId || !campusId) bad('参数不完整')
  if (!isValidDateStr(date)) bad('请选择上课日期')
  if (!isValidTimeStr(startTime)) bad('开始时间格式不正确')
  if (toMinutes(startTime) + 30 > 1440) bad('上课时段不能跨天')

  const req = { campusId, type: 'trial', date, startTime, duration: 30, fromDate: todayStr() }
  await assertTeacherEligible(req, teacherId)

  const res = await insertOne('courses', {
    type: 'trial', studentId, teacherId, campusId,
    duration: 30, totalSessions: 1,
    status: 'pending'
  })
  await createCourseSessions(res.id, req, teacherId, studentId)
  return { courseId: res.id }
}

// 发起正式课（系列）
async function createRegular(event) {
  requireAuth(event, 'admin')
  const { studentId, teacherId, campusId, startTime } = event
  const weekday = Number(event.weekday)
  const duration = Number(event.duration)
  const totalSessions = Number(event.totalSessions)
  if (!studentId || !teacherId || !campusId) bad('参数不完整')
  if (!(weekday >= 0 && weekday <= 6)) bad('请选择星期几')
  if (!isValidTimeStr(startTime)) bad('开始时间格式不正确')
  if (![60, 90, 120].includes(duration)) bad('单次时长只能选 1h / 1.5h / 2h')
  if (!(Number.isInteger(totalSessions) && totalSessions >= 1 && totalSessions <= 100)) bad('总次数需为 1-100 的整数')
  if (toMinutes(startTime) + duration > 1440) bad('上课时段不能跨天')

  const req = { campusId, type: 'regular', weekday, startTime, duration, totalSessions, fromDate: todayStr() }
  await assertTeacherEligible(req, teacherId)

  const res = await insertOne('courses', {
    type: 'regular', studentId, teacherId, campusId,
    duration, totalSessions,
    status: 'pending'
  })
  const count = await createCourseSessions(res.id, req, teacherId, studentId)
  return { courseId: res.id, sessionCount: count }
}

// 老师确认（二次校验冲突）
async function confirm(event) {
  const payload = requireAuth(event, 'teacher')
  const { courseId } = event
  if (!courseId) bad('参数错误')
  const courseRows = await queryAll('courses', { id: courseId }, { limit: 1 })
  if (!courseRows.length) bad('课程不存在')
  const course = courseRows[0]
  if (course.teacherId !== payload.uid) throw Object.assign(new Error('只能确认自己的课程'), { code: 403 })
  if (course.status !== 'pending') bad('课程不在待确认状态')

  const pending = await queryAll('sessions', { courseId, status: 'pending' })
  // 二次校验：与本老师其他占用 session 冲突则确认失败
  const others = await queryAll('sessions', {
    teacherId: payload.uid,
    status: F.in(BLOCKING_STATUS),
    courseId: F.neq(courseId)
  })
  for (const s of pending) {
    const occ = { date: s.date, startMin: toMinutes(s.startTime), endMin: toMinutes(s.endTime) }
    const hit = others.find(o => sessionConflictsWithOcc(o, occ))
    if (hit) {
      bad(`确认失败：${s.date} ${s.startTime} 与已排课程（${hit.date} ${hit.startTime}-${hit.endTime}）冲突`)
    }
  }
  for (const s of pending) {
    await updateById('sessions', s.id, { status: 'confirmed' })
  }
  await updateById('courses', courseId, { status: 'confirmed' })
  return { done: true }
}

// 老师拒绝
async function reject(event) {
  const payload = requireAuth(event, 'teacher')
  const { courseId } = event
  if (!courseId) bad('参数错误')
  const courseRows = await queryAll('courses', { id: courseId }, { limit: 1 })
  if (!courseRows.length) bad('课程不存在')
  if (courseRows[0].teacherId !== payload.uid) throw Object.assign(new Error('只能拒绝自己的课程'), { code: 403 })
  if (courseRows[0].status !== 'pending') bad('课程不在待确认状态')
  const pending = await queryAll('sessions', { courseId, status: 'pending' })
  for (const s of pending) {
    await updateById('sessions', s.id, { status: 'cancelled' })
  }
  await updateById('courses', courseId, { status: 'rejected' })
  return { done: true }
}

// 名称映射辅助
async function nameMaps({ studentIds = [], teacherIds = [], campusIds = [] }) {
  const [stu, tea, cam] = await Promise.all([
    studentIds.length ? queryAll('students', { id: F.in(studentIds) }) : [],
    teacherIds.length ? queryAll('users', { id: F.in(teacherIds) }) : [],
    campusIds.length ? queryAll('campuses', { id: F.in(campusIds) }) : []
  ])
  return {
    student: Object.fromEntries(stu.map(x => [x.id, x.name])),
    teacher: Object.fromEntries(tea.map(x => [x.id, x.name])),
    campus: Object.fromEntries(cam.map(x => [x.id, x.name]))
  }
}

function formatSession(s, maps, courseById) {
  const course = courseById[s.courseId] || {}
  return {
    sessionId: s.id,
    courseId: s.courseId,
    courseType: course.type,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    campusName: maps.campus[s.campusId] || '',
    teacherName: maps.teacher[s.teacherId] || '',
    studentName: maps.student[course.studentId] || ''
  }
}

// 课表查询：管理端可按 campusId/teacherId 筛选；老师端查自己
async function schedule(event) {
  const payload = requireAuth(event)
  const { startDate, endDate } = event
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) bad('日期范围不正确')
  const where = { date: F.and(F.gte(startDate), F.lte(endDate)) }
  if (payload.role === 'teacher') {
    where.teacherId = payload.uid
  } else {
    if (event.campusId) where.campusId = event.campusId
    if (event.teacherId) where.teacherId = event.teacherId
  }
  const list = await queryAll('sessions', where)
  const active = list.filter(s => s.status !== 'cancelled')
  const courseIds = [...new Set(active.map(s => s.courseId))]
  const courseList = courseIds.length ? await queryAll('courses', { id: F.in(courseIds) }) : []
  const courseById = Object.fromEntries(courseList.map(c => [c.id, c]))
  const maps = await nameMaps({
    studentIds: [...new Set(courseList.map(c => c.studentId))],
    teacherIds: [...new Set(active.map(s => s.teacherId))],
    campusIds: [...new Set(active.map(s => s.campusId))]
  })
  return { list: active.map(s => formatSession(s, maps, courseById)) }
}

// 老师端待办：待确认课程（含每次课时间）
async function todoList(event) {
  const payload = requireAuth(event, 'teacher')
  const pending = await queryAll('sessions', { teacherId: payload.uid, status: 'pending' })
  if (!pending.length) return { list: [] }
  const courseIds = [...new Set(pending.map(s => s.courseId))]
  const courseList = await queryAll('courses', { id: F.in(courseIds), status: 'pending' })
  const validIds = new Set(courseList.map(c => c.id))
  const maps = await nameMaps({
    studentIds: [...new Set(courseList.map(c => c.studentId))],
    campusIds: [...new Set(pending.map(s => s.campusId))]
  })
  const byCourse = {}
  for (const s of pending.filter(x => validIds.has(x.courseId))) {
    (byCourse[s.courseId] = byCourse[s.courseId] || []).push({
      date: s.date, startTime: s.startTime, endTime: s.endTime,
      campusName: maps.campus[s.campusId] || ''
    })
  }
  return {
    list: courseList.map(c => ({
      courseId: c.id,
      type: c.type,
      studentName: maps.student[c.studentId] || '',
      totalSessions: c.totalSessions,
      sessions: (byCourse[c.id] || []).sort((a, b) => a.date < b.date ? -1 : 1)
    }))
  }
}

// 管理端待办：待确认 + 被拒绝课程
async function adminTodo(event) {
  requireAuth(event, 'admin')
  const list = await queryAll('courses', { status: F.in(['pending', 'rejected']) })
  if (!list.length) return { list: [] }
  const maps = await nameMaps({
    studentIds: [...new Set(list.map(c => c.studentId))],
    teacherIds: [...new Set(list.map(c => c.teacherId))],
    campusIds: [...new Set(list.map(c => c.campusId))]
  })
  return {
    list: list.map(c => ({
      courseId: c.id,
      type: c.type,
      status: c.status,
      studentName: maps.student[c.studentId] || '',
      teacherName: maps.teacher[c.teacherId] || '',
      campusName: maps.campus[c.campusId] || '',
      totalSessions: c.totalSessions,
      createdAt: c.createdAt
    }))
  }
}

// 仪表盘统计
async function dashboardStats(event) {
  requireAuth(event, 'admin')
  const today = todayStr()
  const [todaySessions, pendingCourses, pendingTeachers] = await Promise.all([
    queryAll('sessions', { date: today, status: F.in(BLOCKING_STATUS) }),
    queryAll('courses', { status: 'pending' }),
    queryAll('users', { role: 'teacher', status: 'pending' })
  ])
  return {
    todayCount: todaySessions.length,
    pendingConfirmCount: pendingCourses.length,
    pendingApprovalCount: pendingTeachers.length
  }
}

const handlers = { createTrial, createRegular, confirm, reject, schedule, todoList, adminTodo, dashboardStats }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
