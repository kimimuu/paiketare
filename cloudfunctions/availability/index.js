// availability 云函数：老师可带校区与可排时间录入（一期直接生效，预留 approvalStatus 字段）
const { F, queryAll, insertOne, updateById, removeById } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, todayStr } = require('./common/timeUtils')
const { slotOverlapsExisting } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// 保存可带校区（整体替换）
async function setCampuses(event) {
  const payload = requireAuth(event, 'teacher')
  const { campusIds } = event
  if (!Array.isArray(campusIds)) bad('参数错误')
  // 校验校区都存在
  if (campusIds.length) {
    const found = await queryAll('campuses', { id: F.in(campusIds) }, { limit: 100 })
    if (found.length !== campusIds.length) bad('包含不存在的校区')
  }
  const rows = await queryAll('teachers', { userId: payload.uid }, { limit: 1 })
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

// 新增可排时段
async function addSlot(event) {
  const payload = requireAuth(event, 'teacher')
  const { type, weekday, date, startTime, endTime } = event
  validateSlot(event)
  const existing = await queryAll('availabilities', { teacherId: payload.uid }, { limit: 1000 })
  const candidate = { type, weekday: Number(weekday), date, startTime, endTime }
  if (slotOverlapsExisting(existing, candidate)) {
    bad('与既有时段重叠')
  }
  const res = await insertOne('availabilities', {
    teacherId: payload.uid,
    type,
    weekday: type === 'weekly' ? Number(weekday) : null,
    date: type === 'date' ? date : null,
    startTime, endTime,
    approvalStatus: 'approved' // 一期直接生效，二期接入审批流
  })
  return { slotId: res.id }
}

// 删除时段
async function removeSlot(event) {
  const payload = requireAuth(event, 'teacher')
  const { slotId } = event
  if (!slotId) bad('参数错误')
  const rows = await queryAll('availabilities', { id: slotId }, { limit: 1 })
  if (!rows.length) bad('时段不存在')
  if (rows[0].teacherId !== payload.uid) throw Object.assign(new Error('只能删除自己的时段'), { code: 403 })
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

const handlers = { setCampuses, addSlot, removeSlot, listMy }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
