// availability 云函数：老师可带校区与可排时间录入（一期直接生效，预留 approvalStatus 字段）
const { db, _, COLLECTIONS } = require('./common/db')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { isValidDateStr, isValidTimeStr, toMinutes, todayStr } = require('./common/timeUtils')
const { slotOverlapsExisting } = require('./common/scheduleCore')

const teachers = db.collection(COLLECTIONS.teachers)
const campuses = db.collection(COLLECTIONS.campuses)
const availabilities = db.collection(COLLECTIONS.availabilities)

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
    const { data } = await campuses.where({ _id: _.in(campusIds) }).limit(100).get()
    if (data.length !== campusIds.length) bad('包含不存在的校区')
  }
  const { data } = await teachers.where({ userId: payload.uid }).limit(1).get()
  if (!data.length) bad('老师信息不存在')
  await teachers.doc(data[0]._id).update({
    campuses: campusIds,
    updatedAt: new Date()
  })
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
  const { data: existing } = await availabilities.where({ teacherId: payload.uid }).limit(1000).get()
  const candidate = { type, weekday: Number(weekday), date, startTime, endTime }
  if (slotOverlapsExisting(existing, candidate)) {
    bad('与既有时段重叠')
  }
  const res = await availabilities.add({
    teacherId: payload.uid,
    type,
    weekday: type === 'weekly' ? Number(weekday) : null,
    date: type === 'date' ? date : null,
    startTime, endTime,
    approvalStatus: 'approved', // 一期直接生效，二期接入审批流
    createdAt: new Date(),
    updatedAt: new Date()
  })
  return { slotId: res.id }
}

// 删除时段
async function removeSlot(event) {
  const payload = requireAuth(event, 'teacher')
  const { slotId } = event
  if (!slotId) bad('参数错误')
  const { data } = await availabilities.where({ _id: slotId }).limit(1).get()
  if (!data.length) bad('时段不存在')
  if (data[0].teacherId !== payload.uid) throw Object.assign(new Error('只能删除自己的时段'), { code: 403 })
  await availabilities.doc(slotId).remove()
  return { done: true }
}

// 我的录入概览
async function listMy(event) {
  const payload = requireAuth(event, 'teacher')
  const { data: t } = await teachers.where({ userId: payload.uid }).limit(1).get()
  const { data: slots } = await availabilities.where({ teacherId: payload.uid }).limit(1000).get()
  return {
    campuses: t.length ? (t[0].campuses || []) : [],
    slots: slots.map(s => ({
      slotId: s._id, type: s.type, weekday: s.weekday, date: s.date,
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
