// availability 云函数：老师可带校区与可排时间录入
const { F, queryAll, insertOne, updateById, removeById } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, todayStr } = require('./common/timeUtils')
const { slotOverlapsExisting } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 站内消息（内嵌）
async function sendMessage({ toId, fromId = '', type = '', content, linkType = '', linkId = '' }) {
  try {
    await insertOne('messages', { fromId, toId, type, content, linkType, linkId, read: false })
  } catch (e) { console.warn('sendMessage failed:', e.message) }
}

// 保存可带校区（整体替换）—— 管理员专用，老师端走审批
async function setCampuses(event) {
  const payload = requireAuth(event, 'admin')
  const { userId, campusIds } = event
  if (!userId || !Array.isArray(campusIds)) bad('参数错误')
  if (campusIds.length) {
    const found = await queryAll('campuses', { id: F.in(campusIds) }, { limit: 100 })
    if (found.length !== campusIds.length) bad('包含不存在的校区')
  }
  const rows = await queryAll('teachers', { userId }, { limit: 1 })
  if (!rows.length) bad('老师信息不存在')
  await updateById('teachers', rows[0].id, { campuses: campusIds })
  return { done: true }
}

function validateSlot({ type, weekday, date, startTime, endTime }) {
  if (!isValidTimeStr(startTime) || !isValidTimeStr(endTime)) bad('时间格式不正确')
  if (toMinutes(endTime) <= toMinutes(startTime)) bad('结束时间必须晚于开始时间（时段不可跨天）')
  if (type === 'weekly') {
    const wd = Number(weekday)
    if (!(wd >= 0 && wd <= 6)) bad('星期几不正确')
  } else if (type === 'date') {
    if (!isValidDateStr(date)) bad('日期不正确')
    if (date < todayStr()) bad('不能录入过去的日期')
  } else {
    bad('时段类型不正确')
  }
}

// 新增可排时段 —— 管理员专用，老师端走审批
async function addSlot(event) {
  const payload = requireAuth(event, 'admin')
  const { userId, type, weekday, date, startTime, endTime } = event
  if (!userId) bad('参数错误')
  validateSlot(event)
  const existing = await queryAll('availabilities', { teacherId: userId }, { limit: 1000 })
  const candidate = { type, weekday: Number(weekday), date, startTime, endTime }
  if (slotOverlapsExisting(existing, candidate)) {
    bad('与既有时段重叠')
  }
  const res = await insertOne('availabilities', {
    teacherId: userId,
    type,
    weekday: type === 'weekly' ? Number(weekday) : null,
    date: type === 'date' ? date : null,
    startTime, endTime,
    approvalStatus: 'approved'
  })
  return { slotId: res.id }
}

// 删除时段 —— 管理员专用
async function removeSlot(event) {
  const payload = requireAuth(event, 'admin')
  const { slotId } = event
  if (!slotId) bad('参数错误')
  const rows = await queryAll('availabilities', { id: slotId }, { limit: 1 })
  if (!rows.length) bad('时段不存在')
  await removeById('availabilities', slotId)
  return { done: true }
}

// 我的录入概览
async function listMy(event) {
  const payload = requireAuth(event, 'teacher')
  const [tRows, slots] = await Promise.all([
    queryAll('teachers', { userId: payload.uid }, { limit: 1 }),
    queryAll('availabilities', { teacherId: payload.uid }, { limit: 1000 })
  ])
  return {
    campuses: tRows.length ? (tRows[0].campuses || []) : [],
    slots: slots.map(s => ({
      slotId: s.id, type: s.type, weekday: s.weekday, date: s.date,
      startTime: s.startTime, endTime: s.endTime
    }))
  }
}

// ========== 二期：审批流 ==========

// 老师提交时间+校区修改审批
async function submitChange(event) {
  const payload = requireAuth(event, 'teacher')
  const { slots, campuses } = event
  if (!Array.isArray(slots) || !Array.isArray(campuses)) bad('参数错误')

  // 1. 校验无 pending 单
  const pending = await queryAll('approvals', {
    targetId: payload.uid, type: 'availability_change', status: 'pending'
  }, { limit: 1 })
  if (pending.length) bad('已有待审批申请，请等待审批或撤回')

  // 2. 校验时段合法性 + 内部不重叠
  const normalized = []
  for (const s of slots) {
    validateSlot(s)
    normalized.push({
      type: s.type,
      weekday: s.type === 'weekly' ? Number(s.weekday) : null,
      date: s.type === 'date' ? s.date : null,
      startTime: s.startTime,
      endTime: s.endTime
    })
  }
  for (let i = 0; i < normalized.length; i++) {
    if (slotOverlapsExisting(normalized.slice(0, i), normalized[i])) {
      bad('时段之间存在重叠')
    }
  }

  // 3. 校验校区存在
  if (campuses.length) {
    const found = await queryAll('campuses', { id: F.in(campuses) }, { limit: 100 })
    if (found.length !== campuses.length) bad('包含不存在的校区')
  }

  // 4. 写入审批单（不修改 availabilities/teachers）
  const res = await insertOne('approvals', {
    type: 'availability_change',
    targetId: payload.uid,
    submitterId: payload.uid,
    status: 'pending',
    payload: { slots: normalized, campuses }
  })

  // D: 通知所有 admin 有新审批待处理
  const admins = await queryAll('users', { role: 'admin', status: 'active' })
  const me = await queryAll('users', { id: payload.uid }, { limit: 1 })
  const name = me.length ? me[0].name : ''
  for (const a of admins) {
    await sendMessage({
      toId: a.id, fromId: payload.uid, type: 'new_approval',
      content: `【新审批待处理】${name} 提交了时间/校区修改申请，请尽快审批`,
      linkType: 'approval', linkId: res.id
    })
  }

  return { approvalId: res.id }
}

// 查询当前待审批申请
async function getMyPendingChange(event) {
  const payload = requireAuth(event, 'teacher')
  const list = await queryAll('approvals', {
    targetId: payload.uid, type: 'availability_change', status: 'pending'
  }, { orderBy: 'createdAt', orderDir: 'desc', limit: 1 })
  return list.length ? formatApproval(list[0]) : null
}

// 我的审批历史
async function listMyApprovals(event) {
  const payload = requireAuth(event, 'teacher')
  const list = await queryAll('approvals', {
    targetId: payload.uid, type: 'availability_change'
  }, { orderBy: 'createdAt', orderDir: 'desc', limit: 50 })
  return { list: list.map(formatApproval) }
}

// 撤回待审批申请
async function withdrawApproval(event) {
  const payload = requireAuth(event, 'teacher')
  const { approvalId } = event
  if (!approvalId) bad('参数错误')
  const rows = await queryAll('approvals', { id: approvalId }, { limit: 1 })
  if (!rows.length) bad('审批单不存在')
  if (rows[0].submitterId !== payload.uid) throw Object.assign(new Error('只能撤回自己的申请'), { code: 403 })
  if (rows[0].status !== 'pending') bad('该申请已处理，无法撤回')
  await updateById('approvals', approvalId, { status: 'withdrawn' })
  return { done: true }
}

function formatApproval(a) {
  return {
    approvalId: a.id,
    status: a.status,
    payload: a.payload,
    rejectReason: a.rejectReason || '',
    createdAt: a.createdAt,
    updatedAt: a.updatedAt
  }
}

const handlers = {
  setCampuses, addSlot, removeSlot, listMy,
  submitChange, getMyPendingChange, listMyApprovals, withdrawApproval
}

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
