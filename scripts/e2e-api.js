// 端到端 API 链路测试：模拟前端行为（匿名网关凭证 + 业务 token 进 payload）
// 覆盖：老师改密/选校区/录时间 → 管理员筛选候选/排课 → 老师确认 → 管理员课表复核
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`

let passed = 0
let failed = 0
function ok(cond, label, extra) {
  if (cond) {
    passed++
    console.log(`  PASS ${label}`)
  } else {
    failed++
    console.log(`  FAIL ${label}${extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 300) : ''}`)
  }
}

async function anonToken() {
  const res = await fetch(`${BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-api' },
    body: '{}'
  })
  const body = await res.json()
  if (!body.access_token) throw new Error('匿名登录失败: ' + JSON.stringify(body))
  return body.access_token
}

async function call(gwToken, name, data) {
  const res = await fetch(`${BASE}/v1/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-api', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  const body = await res.json()
  if (res.status !== 200 || body.code === undefined) {
    throw new Error(`网关调用 ${name} 失败 HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body
}

function addDays(dateStr, n) {
  const dt = new Date(dateStr + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

async function main() {
  const gw = await anonToken()

  // ===== 第二幕：老师改密 / 选校区 / 录时间 =====
  console.log('第二幕：老师端（张老师）')
  let r = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: '000001' })
  let teaTok
  if (r.code === 0) {
    ok(true, '老师初始密码登录')
    teaTok = r.data.token
    ok(r.data.user && r.data.user.needChangePassword === true, '首次登录标记需改密', r.data.user)
    r = await call(gw, 'auth', { action: 'changePassword', token: teaTok, oldPassword: '000001', newPassword: 'zhang123456' })
    ok(r.code === 0, '修改密码', r)
    r = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: '000001' })
    ok(r.code === 400, '旧密码登录被拒', r)
  } else {
    ok(true, '（幂等）初始密码已改，跳过改密步骤')
    r = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: 'zhang123456' })
  }
  ok(r.code === 0, '老师登录', r)
  teaTok = r.data.token

  // 管理员会话（用于读基础数据）
  r = await call(gw, 'auth', { action: 'login', phone: '13800000000', password: 'admin123456' })
  const admTok = r.data.token
  ok(r.code === 0, '管理员登录', r)

  const campuses = (await call(gw, 'baseData', { action: 'listCampuses', token: admTok })).data.list
  const campus = campuses[0]
  ok(campus && campus.name === '旗舰校区', '读取校区', campuses)
  const campusId = campus.campusId

  r = await call(gw, 'availability', { action: 'setCampuses', token: teaTok, campusIds: [campusId] })
  ok(r.code === 0, '老师选可带校区', r)

  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1)
  r = await call(gw, 'availability', { action: 'addSlot', token: teaTok, type: 'date', date: tomorrow, startTime: '18:00', endTime: '21:00' })
  ok(r.code === 0 || (r.code === 400 && /重叠/.test(r.message || '')), '录入可用时段（明天 18:00-21:00）', r)
  r = await call(gw, 'availability', { action: 'listMy', token: teaTok })
  ok(r.code === 0 && r.data.slots.length >= 1 && r.data.campuses.length === 1, '老师录入概览', r.data)

  // ===== 第三幕：管理员筛选候选 + 排课 =====
  console.log('第三幕：管理员排课')
  const students = (await call(gw, 'baseData', { action: 'listStudents', token: admTok })).data.list
  const student = students.find(s => s.name === '小明')
  ok(!!student, '读取学生', students)

  // 选一个老师明天空闲的 30 分钟起点，保证脚本可重复执行
  const mySched = (await call(gw, 'course', { action: 'schedule', token: teaTok, startDate: tomorrow, endDate: tomorrow })).data.list || []
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let trialStart = null
  for (let m = 18 * 60; m + 30 <= 21 * 60; m += 30) {
    const clash = mySched.some(x => toMin(x.startTime) < m + 30 && toMin(x.endTime) > m)
    if (!clash) { trialStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; break }
  }
  ok(!!trialStart, '选取空闲试听起点', mySched)

  r = await call(gw, 'schedule', { action: 'filterTeachers', token: admTok, campusId, type: 'trial', date: tomorrow, startTime: trialStart })
  ok(r.code === 0, '候选筛选调用成功', r)
  const names = (r.data.list || []).map(t => t.name)
  ok(names.includes('张老师'), '候选包含张老师（录了时间+校区）', names)
  ok(!names.includes('李老师'), '候选排除李老师（未录时间）', names)

  const teachers = (await call(gw, 'auth', { action: 'listTeachers', token: admTok })).data.list
  const zhang = teachers.find(t => t.name === '张老师')
  ok(!!zhang, '读取老师', teachers)

  r = await call(gw, 'course', { action: 'createTrial', token: admTok, studentId: student.studentId, teacherId: zhang.uid, campusId, date: tomorrow, startTime: trialStart })
  ok(r.code === 0 && r.data.courseId, '发起体验课', r)
  const courseId = r.data.courseId

  // 越权与不满足条件场景
  r = await call(gw, 'course', { action: 'createTrial', token: admTok, studentId: student.studentId, teacherId: zhang.uid, campusId, date: tomorrow, startTime: '22:00' })
  ok(r.code === 400, '不满足可用时段的排课被拒', r)
  r = await call(gw, 'course', { action: 'confirm', token: teaTok, courseId: '' })
  ok(r.code === 400, '确认空课程ID被拒', r)

  // ===== 第四幕：老师确认 =====
  console.log('第四幕：老师确认')
  r = await call(gw, 'course', { action: 'todoList', token: teaTok })
  const todo = (r.data.list || []).find(x => x.courseId === courseId)
  ok(!!todo, '老师待办含新课程', r.data)
  ok(todo && todo.studentName === '小明' && todo.sessions.length === 1, '待办详情正确', todo)

  r = await call(gw, 'course', { action: 'confirm', token: teaTok, courseId })
  ok(r.code === 0, '老师确认课程', r)

  // ===== 第五幕：管理员复核 =====
  console.log('第五幕：管理员复核')
  const today = new Date().toISOString().slice(0, 10)
  r = await call(gw, 'course', { action: 'schedule', token: admTok, startDate: today, endDate: addDays(today, 7) })
  ok(r.code === 0, '课表查询', r)
  const sess = (r.data.list || []).find(s => s.courseId === courseId)
  ok(sess && sess.status === 'confirmed', '课表含已确认课程', r.data.list)
  ok(sess && sess.teacherName === '张老师' && sess.studentName === '小明' && sess.campusName === '旗舰校区', '课表字段正确', sess)

  r = await call(gw, 'course', { action: 'adminTodo', token: admTok })
  ok(r.code === 0 && !(r.data.list || []).some(x => x.courseId === courseId), '管理端待办不含本次课程', r.data)

  // 老师端课表（自己可见）
  r = await call(gw, 'course', { action: 'schedule', token: teaTok, startDate: today, endDate: addDays(today, 7) })
  const mine = (r.data.list || []).find(s => s.courseId === courseId)
  ok(!!mine && mine.status === 'confirmed', '老师端课表可见自己课程', r.data)

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error('E2E 异常:', err.message)
  process.exit(1)
})
