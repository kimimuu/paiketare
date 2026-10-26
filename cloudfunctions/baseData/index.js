// baseData 云函数：校区与学生管理
const { db, _, COLLECTIONS } = require('./common/db')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { BLOCKING_STATUS } = require('./common/scheduleCore')

const campuses = db.collection(COLLECTIONS.campuses)
const students = db.collection(COLLECTIONS.students)
const courses = db.collection(COLLECTIONS.courses)
const sessions = db.collection(COLLECTIONS.sessions)

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// ---------- 校区 ----------

// 校区列表（所有登录用户可用，老师端选校区也要用）
async function listCampuses(event) {
  requireAuth(event)
  const { data } = await campuses.orderBy('createdAt', 'asc').limit(100).get()
  return { list: data.map(c => ({ campusId: c._id, name: c.name, address: c.address || '' })) }
}

async function addCampus(event) {
  requireAuth(event, 'admin')
  const { name, address } = event
  if (!name || !name.trim()) bad('校区名称不能为空')
  const { data: exist } = await campuses.where({ name: name.trim() }).limit(1).get()
  if (exist.length) bad('校区已存在')
  const res = await campuses.add({
    name: name.trim(), address: (address || '').trim(),
    createdAt: new Date(), updatedAt: new Date()
  })
  return { campusId: res.id }
}

async function updateCampus(event) {
  requireAuth(event, 'admin')
  const { campusId, name, address } = event
  if (!campusId || !name || !name.trim()) bad('参数错误')
  const { data: exist } = await campuses.where({ name: name.trim(), _id: _.neq(campusId) }).limit(1).get()
  if (exist.length) bad('校区名称与其他校区重复')
  await campuses.doc(campusId).update({ name: name.trim(), address: (address || '').trim(), updatedAt: new Date() })
  return { done: true }
}

async function removeCampus(event) {
  requireAuth(event, 'admin')
  const { campusId } = event
  if (!campusId) bad('参数错误')
  const { data: used } = await students.where({ campusId }).limit(1).get()
  if (used.length) bad('该校区下仍有学生，不能删除')
  await campuses.doc(campusId).remove()
  return { done: true }
}

// 预置校区批量导入（幂等：按名称去重）
async function importCampuses(event) {
  requireAuth(event, 'admin')
  const { names } = event
  if (!Array.isArray(names) || !names.length) bad('导入列表为空')
  const { data: exist } = await campuses.limit(100).get()
  const existNames = new Set(exist.map(c => c.name))
  let created = 0
  for (const raw of names) {
    const name = (raw || '').trim()
    if (!name || existNames.has(name)) continue
    await campuses.add({ name, address: '', createdAt: new Date(), updatedAt: new Date() })
    existNames.add(name)
    created++
  }
  return { created }
}

// ---------- 学生 ----------

// 学生列表（管理端），支持按姓名模糊搜索
async function listStudents(event) {
  requireAuth(event, 'admin')
  const { keyword } = event
  const where = {}
  if (keyword && keyword.trim()) {
    where.name = db.RegExp({ regexp: keyword.trim(), options: 'i' })
  }
  const { data } = await students.where(where).orderBy('createdAt', 'desc').limit(500).get()
  return {
    list: data.map(s => ({
      studentId: s._id, name: s.name, campusId: s.campusId, phone: s.phone || ''
    }))
  }
}

function validateStudent({ name, campusId }) {
  if (!name || !name.trim()) bad('学生姓名不能为空')
  if (!campusId) bad('请选择校区')
}

async function addStudent(event) {
  requireAuth(event, 'admin')
  validateStudent(event)
  const { name, campusId, phone } = event
  const { data: campus } = await campuses.where({ _id: campusId }).limit(1).get()
  if (!campus.length) bad('校区不存在')
  const res = await students.add({
    name: name.trim(), campusId, phone: (phone || '').trim(),
    createdAt: new Date(), updatedAt: new Date()
  })
  return { studentId: res.id }
}

async function updateStudent(event) {
  requireAuth(event, 'admin')
  const { studentId } = event
  if (!studentId) bad('参数错误')
  validateStudent(event)
  const { name, campusId, phone } = event
  await students.doc(studentId).update({
    name: name.trim(), campusId, phone: (phone || '').trim(), updatedAt: new Date()
  })
  return { done: true }
}

async function removeStudent(event) {
  requireAuth(event, 'admin')
  const { studentId } = event
  if (!studentId) bad('参数错误')
  // 有进行中课程的学生不能删除
  const { data: courseList } = await courses.where({ studentId }).limit(100).get()
  if (courseList.length) {
    const courseIds = courseList.map(c => c._id)
    const { data: busy } = await sessions.where({
      courseId: _.in(courseIds), status: _.in(BLOCKING_STATUS)
    }).limit(1).get()
    if (busy.length) bad('该学生有进行中的课程，不能删除')
  }
  await students.doc(studentId).remove()
  return { done: true }
}

const handlers = {
  listCampuses, addCampus, updateCampus, removeCampus, importCampuses,
  listStudents, addStudent, updateStudent, removeStudent
}

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) bad('未知操作')
  return handler(event)
})
