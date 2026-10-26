// approval 云函数：审批流管理（时间/校区修改审批）
const { F, queryAll, insertOne, updateById, removeById } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isCovered, BLOCKING_STATUS } = require('./common/scheduleCore')
const { toMinutes, weekdayOf } = require('./common/timeUtils')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 审批列表（管理员）
async function list(event) {
  requireAuth(event, 'admin')
  const { status } = event
  const where = { type: 'availability_change' }
  if (status) where.status = status
  const list = await queryAll('approvals', where, { orderBy: 'createdAt', orderDir: 'desc', limit: 100 })
  // 关联老师姓名
  const userIds = [...new Set(list.map(a => a.targetId))]
  const users = userIds.length ? await queryAll('users', { id: F.in(userIds) }, { limit: 500 }) : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.name]))
  return {
    list: list.map(a => ({
      approvalId: a.id,
      teacherId: a.targetId,
      teacherName: nameById[a.targetId] || '',
      status: a.status,
      rejectReason: a.rejectReason || '',
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }))
  }
}

// 审批详情（含旧数据，供前端对比）
async function get(event) {
  requireAuth(event, 'admin')
  const { approvalId } = event
  if (!approvalId) bad('参数错误')
  const rows = await queryAll('approvals', { id: approvalId }, { limit: 1 })
  if (!rows.length) bad('审批单不存在')
  const a = rows[0]
  const teacherId = a.targetId
  // 旧数据（当前生效）
  const [tRows, oldSlots] = await Promise.all([
    queryAll('teachers', { userId: teacherId }, { limit: 1 }),
    queryAll('availabilities', { teacherId }, { limit: 1000 })
  ])
  const user = (await queryAll('users', { id: teacherId }, { limit: 1 }))[0]
  return {
    approvalId: a.id,
    teacherId,
    teacherName: user ? user.name : '',
    status: a.status,
    rejectReason: a.rejectReason || '',
    payload: a.payload, // { slots, campuses }
    old: {
      campuses: tRows.length ? (tRows[0].campuses || []) : [],
      slots: oldSlots.map(s => ({
        type: s.type, weekday: s.weekday, date: s.date,
        startTime: s.startTime, endTime: s.endTime
      }))
    },
    createdAt: a.createdAt
  }
}

// 通过审批（含冲突检查）
async function approve(event) {
  const admin = requireAuth(event, 'admin')
  const { approvalId } = event
  if (!approvalId) bad('参数错误')
  const rows = await queryAll('approvals', { id: approvalId }, { limit: 1 })
  if (!rows.length) bad('审批单不存在')
  const a = rows[0]
  // 先校验旧状态=pending
  if (a.status !== 'pending') bad('该申请已处理')
  const teacherId = a.targetId
  const { slots: newSlots, campuses: newCampuses } = a.payload

  // 冲突检查：该老师所有 blocking sessions 是否都被新时段覆盖
  const sessions = await queryAll('sessions', {
    teacherId, status: F.in(BLOCKING_STATUS)
  }, { limit: 1000 })
  if (sessions.length) {
    const courseIds = [...new Set(sessions.map(s => s.courseId))]
    const courses = await queryAll('courses', { id: F.in(courseIds) }, { limit: 500 })
    const stuIds = [...new Set(courses.map(c => c.studentId))]
    const students = stuIds.length ? await queryAll('students', { id: F.in(stuIds) }, { limit: 500 }) : []
    const stuName = Object.fromEntries(students.map(s => [s.id, s.name]))
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]))

    const conflicts = []
    for (const s of sessions) {
      const occ = {
        date: s.date,
        weekday: weekdayOf(s.date),
        startMin: toMinutes(s.startTime),
        endMin: toMinutes(s.endTime)
      }
      if (!isCovered(newSlots, occ)) {
        const course = courseById[s.courseId] || {}
        conflicts.push({
          sessionId: s.id,
          courseId: s.courseId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          studentName: course.studentId ? (stuName[course.studentId] || '') : ''
        })
      }
    }
    if (conflicts.length) {
      throw Object.assign(new Error('新时段与已排课程冲突，请先调课或换老师'), {
        code: 400,
        conflicts
      })
    }
  }

  // 无冲突：应用快照
  // 1. 删除旧时段
  const oldSlots = await queryAll('availabilities', { teacherId }, { limit: 1000 })
  for (const s of oldSlots) await removeById('availabilities', s.id)
  // 2. 插入新时段
  for (const s of newSlots) {
    await insertOne('availabilities', {
      teacherId,
      type: s.type,
      weekday: s.type === 'weekly' ? s.weekday : null,
      date: s.type === 'date' ? s.date : null,
      startTime: s.startTime,
      endTime: s.endTime,
      approvalStatus: 'approved'
    })
  }
  // 3. 更新校区
  const tRows = await queryAll('teachers', { userId: teacherId }, { limit: 1 })
  if (tRows.length) {
    await updateById('teachers', tRows[0].id, { campuses: newCampuses || [] })
  }
  // 4. 更新审批状态
  await updateById('approvals', approvalId, { status: 'approved', approverId: admin.uid })
  return { done: true }
}

// 驳回
async function reject(event) {
  const admin = requireAuth(event, 'admin')
  const { approvalId, rejectReason } = event
  if (!approvalId) bad('参数错误')
  const rows = await queryAll('approvals', { id: approvalId }, { limit: 1 })
  if (!rows.length) bad('审批单不存在')
  if (rows[0].status !== 'pending') bad('该申请已处理')
  await updateById('approvals', approvalId, {
    status: 'rejected',
    approverId: admin.uid,
    rejectReason: rejectReason || ''
  })
  return { done: true }
}

const handlers = { list, get, approve, reject }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
