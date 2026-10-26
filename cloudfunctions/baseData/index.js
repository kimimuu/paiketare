// baseData 云函数：校区与学生管理
const { F, queryAll, insertOne, updateById, removeById } = require('./common/pgdb')
const { requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')
const { BLOCKING_STATUS } = require('./common/scheduleCore')

function bad(msg) {
  throw Object.assign(new Error(msg), { code: 400 })
}

// ---------- 校区 ----------

// 校区列表（所有登录用户可用，老师端选校区也要用）
async function listCampuses(event) {
  requireAuth(event)
  const list = await queryAll('campuses', {}, { orderBy: 'createdAt', orderDir: 'asc', limit: 100 })
  return { list: list.map(c => ({ campusId: c.id, name: c.name, address: c.address || '' })) }
}

async function addCampus(event) {
  requireAuth(event, 'admin')
  const { name, address } = event
  if (!name || !name.trim()) bad('校区名称不能为空')
  const exist = await queryAll('campuses', { name: name.trim() }, { limit: 1 })
  if (exist.length) bad('校区已存在')
  const res = await insertOne('campuses', {
    name: name.trim(), address: (address || '').trim()
  })
  return { campusId: res.id }
}

async function updateCampus(event) {
  requireAuth(event, 'admin')
  const { campusId, name, address } = event
  if (!campusId || !name || !name.trim()) bad('参数错误')
  const exist = await queryAll('campuses', { name: name.trim(), id: F.neq(campusId) }, { limit: 1 })
  if (exist.length) bad('校区名称与其他校区重复')
  await updateById('campuses', campusId, {
    name: name.trim(), address: (address || '').trim()
  })
  return { done: true }
}

async function removeCampus(event) {
  requireAuth(event, 'admin')
  const { campusId } = event
  if (!campusId) bad('参数错误')
  const used = await queryAll('students', { campusId }, { limit: 1 })
  if (used.length) bad('该校区下仍有学生，不能删除')
  await removeById('campuses', campusId)
  return { done: true }
}

// 预置校区批量导入（幂等：按名称去重）
async function importCampuses(event) {
  requireAuth(event, 'admin')
  const { names } = event
  if (!Array.isArray(names) || !names.length) bad('导入列表为空')
  const existList = await queryAll('campuses', {}, { limit: 100 })
  const existNames = new Set(existList.map(c => c.name))
  let created = 0
  for (const raw of names) {
    const name = (raw || '').trim()
    if (!name || existNames.has(name)) continue
    await insertOne('campuses', { name, address: '' })
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
  const list = await queryAll('students', {}, { orderBy: 'createdAt', orderDir: 'desc', limit: 500 })
  const kw = (keyword || '').trim().toLowerCase()
  const filtered = kw ? list.filter(s => (s.name || '').toLowerCase().includes(kw)) : list
  return {
    list: filtered.map(s => ({
      studentId: s.id, name: s.name, campusId: s.campusId, phone: s.phone || ''
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
  const campus = await queryAll('campuses', { id: campusId }, { limit: 1 })
  if (!campus.length) bad('校区不存在')
  const res = await insertOne('students', {
    name: name.trim(), campusId, phone: (phone || '').trim()
  })
  return { studentId: res.id }
}

async function updateStudent(event) {
  requireAuth(event, 'admin')
  const { studentId } = event
  if (!studentId) bad('参数错误')
  validateStudent(event)
  const { name, campusId, phone } = event
  await updateById('students', studentId, {
    name: name.trim(), campusId, phone: (phone || '').trim()
  })
  return { done: true }
}

async function removeStudent(event) {
  requireAuth(event, 'admin')
  const { studentId } = event
  if (!studentId) bad('参数错误')
  // 有进行中课程的学生不能删除
  const courseList = await queryAll('courses', { studentId }, { limit: 100 })
  if (courseList.length) {
    const courseIds = courseList.map(c => c.id)
    const busy = await queryAll('sessions', { courseId: F.in(courseIds), status: F.in(BLOCKING_STATUS) }, { limit: 1 })
    if (busy.length) bad('该学生有进行中的课程，不能删除')
  }
  await removeById('students', studentId)
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
