// course 云函数：排课发起、老师确认/拒绝、课表查询、管理端待办、运营调整
const { F, queryAll, insertOne, updateById, rdb } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, toTimeStr, todayStr, weekdayOf, overlaps } = require('./common/timeUtils')
const { filterCandidates, buildOccurrences, BLOCKING_STATUS, sessionConflictsWithOcc, isCovered } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 创建前校验：老师必须在候选筛选中通过
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

// 发起体验课
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

// 发起正式课
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

// 老师确认
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
    campusId: s.campusId,
    campusName: maps.campus[s.campusId] || '',
    teacherId: s.teacherId,
    teacherName: maps.teacher[s.teacherId] || '',
    studentName: maps.student[course.studentId] || ''
  }
}

// 课表查询
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

// 老师端待办
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

// 管理端待办
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

// ========== 二期 B：运营调整 ==========

/**
 * 调单次课时间/日期/校区（admin）
 * 入参: { sessionId, newDate, newStartTime, newEndTime?, newCampusId? }
 */
async function rescheduleSession(event) {
  requireAuth(event, 'admin')
  const { sessionId, newDate, newStartTime, newEndTime, newCampusId } = event
  if (!sessionId || !newDate || !newStartTime) bad('参数错误')
  if (!isValidDateStr(newDate)) bad('日期格式不正确')
  if (!isValidTimeStr(newStartTime)) bad('开始时间格式不正确')
  if (newEndTime && !isValidTimeStr(newEndTime)) bad('结束时间格式不正确')
  if (newCampusId) {
    const cam = await queryAll('campuses', { id: newCampusId }, { limit: 1 })
    if (!cam.length) bad('校区不存在')
  }

  // 1. session 存在
  const sRows = await queryAll('sessions', { id: sessionId }, { limit: 1 })
  if (!sRows.length) bad('session 不存在')
  const session = sRows[0]
  if (!BLOCKING_STATUS.includes(session.status)) {
    throw Object.assign(new Error('已完成或已取消的课不能调整'), { code: 400 })
  }

  // 2. 原 course
  const cRows = await queryAll('courses', { id: session.courseId }, { limit: 1 })
  if (!cRows.length) bad('课程不存在')
  const course = cRows[0]

  // 3. 推导 endTime
  const dur = Number(course.duration)
  let endMin = newEndTime ? toMinutes(newEndTime) : toMinutes(newStartTime) + dur
  if (endMin > 1440) bad('结束时间不能跨天')
  const finalEndTime = toTimeStr(endMin)
  const targetCampus = newCampusId || session.campusId

  // 4. 老师校区包含新校区
  const teacherId = session.teacherId
  const tRows = await queryAll('teachers', { userId: teacherId }, { limit: 1 })
  if (!tRows.length) bad('老师不存在')
  const teacherCampuses = tRows[0].campuses || []
  if (!teacherCampuses.includes(targetCampus)) {
    throw Object.assign(new Error('该老师不支持新校区'), { code: 400 })
  }

  // 5. 新时段在老师可用时段内
  const slots = await queryAll('availabilities', { teacherId })
  const occ = { date: newDate, weekday: weekdayOf(newDate), startMin: toMinutes(newStartTime), endMin }
  if (!isCovered(slots, occ)) {
    throw Object.assign(new Error('新时段不在老师可用时段内'), { code: 400 })
  }

  // 6. 冲突检查：除当前 session 外的 BLOCKING sessions
  const busy = await queryAll('sessions', {
    teacherId,
    status: F.in(BLOCKING_STATUS),
    id: F.neq(sessionId)
  })
  const clash = busy.find(b =>
    b.date === newDate && overlaps(toMinutes(b.startTime), toMinutes(b.endTime), occ.startMin, occ.endMin)
  )
  if (clash) {
    // 查冲突详情
    const clashCourse = await queryAll('courses', { id: clash.courseId }, { limit: 1 })
    const stu = clashCourse.length ? await queryAll('students', { id: clashCourse[0].studentId }, { limit: 1 }) : []
    const conflicts = [{
      sessionId: clash.id,
      courseId: clash.courseId,
      date: clash.date,
      startTime: clash.startTime,
      endTime: clash.endTime,
      studentName: stu.length ? stu[0].name : '未知'
    }]
    throw Object.assign(new Error(`调课失败：${clash.date} ${clash.startTime}-${clash.endTime} 与已有课程（${conflicts[0].studentName}）冲突`), { code: 400, conflicts })
  }

  // 7. 更新
  await updateById('sessions', sessionId, {
    date: newDate, startTime: newStartTime, endTime: finalEndTime, campusId: targetCampus
  })
  return { done: true }
}

/**
 * 换老师：course 主表 + 未上课的 future sessions
 * 入参: { courseId, newTeacherId }
 */
async function changeTeacher(event) {
  requireAuth(event, 'admin')
  const { courseId, newTeacherId } = event
  if (!courseId || !newTeacherId) bad('参数错误')

  // 1. course 存在
  const cRows = await queryAll('courses', { id: courseId }, { limit: 1 })
  if (!cRows.length) bad('课程不存在')
  const course = cRows[0]
  if (course.status === 'cancelled') bad('课程已取消')
  if (newTeacherId === course.teacherId) bad('新老师与现任相同')

  // 2. 新老师存在
  const newT = await queryAll('teachers', { userId: newTeacherId }, { limit: 1 })
  if (!newT.length) bad('新老师不存在')

  // 3. future BLOCKING sessions（date >= today）
  const today = todayStr()
  const allSessions = await queryAll('sessions', { courseId, status: F.in(BLOCKING_STATUS) })
  const future = allSessions.filter(s => s.date >= today)
  if (!future.length) bad('没有待执行的课程')

  // 4. 新老师 availabilities + campuses + busy sessions (排除当前 course)
  const newCampuses = newT[0].campuses || []
  const newSlots = await queryAll('availabilities', { teacherId: newTeacherId })
  const newBusy = await queryAll('sessions', {
    teacherId: newTeacherId,
    status: F.in(BLOCKING_STATUS),
    courseId: F.neq(courseId)
  })

  // 5. 逐 future session 校验
  for (const s of future) {
    if (!newCampuses.includes(s.campusId)) {
      throw Object.assign(new Error(`换老师失败：${s.date} ${s.startTime}-${s.endTime} 新老师不支持该校区`), { code: 400 })
    }
    const occ = { date: s.date, weekday: weekdayOf(s.date), startMin: toMinutes(s.startTime), endMin: toMinutes(s.endTime) }
    if (!isCovered(newSlots, occ)) {
      throw Object.assign(new Error(`换老师失败：${s.date} ${s.startTime}-${s.endTime} 不在新老师可用时段内`), { code: 400 })
    }
    const clash = newBusy.find(b =>
      b.date === s.date && overlaps(toMinutes(b.startTime), toMinutes(b.endTime), occ.startMin, occ.endMin)
    )
    if (clash) {
      throw Object.assign(new Error(`换老师失败：${s.date} ${s.startTime}-${s.endTime} 与新老师已有课程（${clash.date} ${clash.startTime}-${clash.endTime}）冲突`), { code: 400 })
    }
  }

  // 6. 批量更新
  await updateById('courses', courseId, { teacherId: newTeacherId })
  const now = new Date().toISOString()
  await rdb.from('sessions').update({ teacherId: newTeacherId, updatedAt: now })
    .in('id', future.map(s => s.id))

  return { done: true, updatedSessions: future.length }
}

/**
 * 停课：取消所有 BLOCKING sessions + course 状态改 cancelled + endReason
 * 入参: { courseId, reason? }
 */
async function endCourse(event) {
  requireAuth(event, 'admin')
  const { courseId, reason } = event
  if (!courseId) bad('参数错误')

  const cRows = await queryAll('courses', { id: courseId }, { limit: 1 })
  if (!cRows.length) bad('课程不存在')
  const course = cRows[0]
  if (course.status === 'cancelled') bad('课程已取消')

  // 先查数量
  const busy = await queryAll('sessions', { courseId, status: F.in(BLOCKING_STATUS) })
  const cancelledCount = busy.length

  if (cancelledCount > 0) {
    const now = new Date().toISOString()
    await rdb.from('sessions').update({ status: 'cancelled', updatedAt: now })
      .eq('courseId', courseId)
      .in('status', BLOCKING_STATUS)
  }

  const endReason = reason || 'cancelled_by_admin'
  await updateById('courses', courseId, { status: 'cancelled', endReason })

  return { cancelledSessions: cancelledCount }
}

/**
 * 换老师候选查询（轻量）：给定单节课条件，返回可用老师列表
 * 入参: { campusId, date, startTime, duration, excludeTeacherId? }
 */
async function findCandidatesForReschedule(event) {
  requireAuth(event, 'admin')
  const { campusId, date, startTime, duration, excludeTeacherId } = event
  if (!campusId || !date || !startTime || !duration) bad('参数错误')
  if (!isValidDateStr(date)) bad('日期格式不正确')
  if (!isValidTimeStr(startTime)) bad('开始时间格式不正确')

  const dur = Number(duration)
  const endMin = toMinutes(startTime) + dur
  if (endMin > 1440) bad('时段不能跨天')
  const occ = { date, weekday: weekdayOf(date), startMin: toMinutes(startTime), endMin }

  // 所有 active 老师
  const [activeTeachers, teaAll] = await Promise.all([
    queryAll('users', { role: 'teacher', status: 'active' }),
    queryAll('teachers', {})
  ])

  const results = []
  for (const u of activeTeachers) {
    if (u.id === excludeTeacherId) continue
    const tea = teaAll.find(t => t.userId === u.id)
    if (!tea) continue
    if (!(tea.campuses || []).includes(campusId)) continue

    const slots = await queryAll('availabilities', { teacherId: u.id })
    if (!isCovered(slots, occ)) continue

    const busy = await queryAll('sessions', {
      teacherId: u.id, date, status: F.in(BLOCKING_STATUS)
    })
    const clash = busy.find(b => overlaps(toMinutes(b.startTime), toMinutes(b.endTime), occ.startMin, occ.endMin))
    if (clash) continue

    results.push({ uid: u.id, name: u.name })
  }

  return { list: results }
}

const handlers = {
  createTrial, createRegular, confirm, reject,
  schedule, todoList, adminTodo, dashboardStats,
  rescheduleSession, changeTeacher, endCourse, findCandidatesForReschedule
}

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
