// auth 云函数：登录、注册、批量导入、改密码、审批、老师列表
const { queryAll, insertOne, updateById } = require('./common/pgdb')
const { hashPassword, verifyPassword, signToken, requireAuth } = require('./common/auth')
const { wrap } = require('./common/resp')

function publicUser(u) {
  return {
    uid: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    needChangePassword: !!u.needChangePassword
  }
}

// 登录
async function login({ phone, password }) {
  if (!phone || !password) throw Object.assign(new Error('请输入手机号和密码'), { code: 400 })
  const user = (await queryAll('users', { phone }, { limit: 1 }))[0]
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    throw Object.assign(new Error('手机号或密码错误'), { code: 400 })
  }
  if (user.status === 'pending') throw Object.assign(new Error('注册待管理员审批'), { code: 403 })
  if (user.status === 'rejected') throw Object.assign(new Error('注册已被拒绝，请联系管理员'), { code: 403 })
  const token = signToken({ uid: user.id, role: user.role, name: user.name })
  return { user: publicUser(user), token }
}

// 老师自主注册（待审批）
async function register({ name, phone, password }) {
  if (!name || !phone || !password) throw Object.assign(new Error('请填写完整信息'), { code: 400 })
  if (!/^1\d{10}$/.test(phone)) throw Object.assign(new Error('手机号格式不正确'), { code: 400 })
  if (password.length < 6) throw Object.assign(new Error('密码至少6位'), { code: 400 })
  const exist = await queryAll('users', { phone }, { limit: 1 })
  if (exist.length) throw Object.assign(new Error('该手机号已注册'), { code: 400 })
  const { salt, hash } = hashPassword(password)
  const res = await insertOne('users', {
    name, phone, salt, hash,
    role: 'teacher', status: 'pending', needChangePassword: false
  })
  await insertOne('teachers', { userId: res.id, campuses: [] })
  return { registered: true }
}

// 管理员批量导入老师（初始密码=手机号后6位）
async function importTeachers(event) {
  requireAuth(event, 'admin')
  const { list } = event
  if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('导入列表为空'), { code: 400 })
  let created = 0
  const skipped = []
  for (const item of list) {
    const { name, phone } = item
    if (!name || !/^1\d{10}$/.test(phone || '')) {
      skipped.push({ ...item, reason: '姓名或手机号格式错误' })
      continue
    }
    const exist = await queryAll('users', { phone }, { limit: 1 })
    if (exist.length) {
      skipped.push({ ...item, reason: '手机号已存在' })
      continue
    }
    const initialPwd = phone.slice(-6)
    const { salt, hash } = hashPassword(initialPwd)
    const res = await insertOne('users', {
      name, phone, salt, hash,
      role: 'teacher', status: 'active', needChangePassword: true
    })
    await insertOne('teachers', { userId: res.id, campuses: [] })
    created++
  }
  return { created, skipped }
}

// 管理员审批注册
async function approveTeacher(event) {
  requireAuth(event, 'admin')
  const { uid, approve } = event
  await updateById('users', uid, { status: approve ? 'active' : 'rejected' })
  return { done: true }
}

// 修改密码
async function changePassword(event) {
  const payload = requireAuth(event)
  const { oldPassword, newPassword } = event
  if (!newPassword || newPassword.length < 6) throw Object.assign(new Error('新密码至少6位'), { code: 400 })
  const user = (await queryAll('users', { id: payload.uid }, { limit: 1 }))[0]
  if (!user || !verifyPassword(oldPassword, user.salt, user.hash)) {
    throw Object.assign(new Error('原密码错误'), { code: 400 })
  }
  const { salt, hash } = hashPassword(newPassword)
  await updateById('users', payload.uid, { salt, hash, needChangePassword: false })
  return { done: true }
}

// 老师列表（管理端）：含审批状态与校区数
async function listTeachers(event) {
  requireAuth(event, 'admin')
  const [userList, teacherList] = await Promise.all([
    queryAll('users', { role: 'teacher' }),
    queryAll('teachers')
  ])
  const campusCount = {}
  for (const t of teacherList) campusCount[t.userId] = (t.campuses || []).length
  return {
    list: userList.map(u => ({
      ...publicUser(u),
      status: u.status,
      campusCount: campusCount[u.id] || 0
    }))
  }
}

// 创建管理员（仅初始化用：无管理员时允许创建第一个）
async function initAdmin({ name, phone, password }) {
  const admins = await queryAll('users', { role: 'admin' }, { limit: 1 })
  if (admins.length) throw Object.assign(new Error('管理员已存在'), { code: 403 })
  if (!name || !/^1\d{10}$/.test(phone || '') || !password || password.length < 6) {
    throw Object.assign(new Error('参数错误'), { code: 400 })
  }
  const { salt, hash } = hashPassword(password)
  await insertOne('users', {
    name, phone, salt, hash,
    role: 'admin', status: 'active', needChangePassword: false
  })
  return { created: true }
}

const handlers = { login, register, importTeachers, approveTeacher, changePassword, listTeachers, initAdmin }

exports.main = wrap(async (event) => {
  const handler = handlers[event.action]
  if (!handler) throw Object.assign(new Error('未知操作'), { code: 400 })
  return handler(event)
})
