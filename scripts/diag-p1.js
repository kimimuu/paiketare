// 走网关 API 查数据（绕开 tencentcloud SDK 鉴权问题）
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`

async function anonToken() {
  const res = await fetch(`${BASE}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'diag' }, body: '{}'
  })
  return (await res.json()).access_token
}

async function call(gwToken, name, data) {
  const res = await fetch(`${BASE}/v1/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'diag', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return res.json()
}

async function main() {
  const gw = await anonToken()
  let r = await call(gw, 'auth', { action: 'login', phone: '13800000000', password: 'admin123456' })
  const admTok = r.data.token
  console.log('登录:', r.code)

  console.log('\n=== 校区 ===')
  r = await call(gw, 'baseData', { action: 'listCampuses', token: admTok })
  console.log(JSON.stringify(r.data.list || [], null, 1))

  console.log('\n=== 学生 ===')
  r = await call(gw, 'baseData', { action: 'listStudents', token: admTok })
  console.log(JSON.stringify(r.data.list || [], null, 1))

  console.log('\n=== 老师 ===')
  r = await call(gw, 'auth', { action: 'listTeachers', token: admTok })
  console.log(JSON.stringify((r.data.list || []).map(t => ({ uid: t.uid, name: t.name, status: t.status })), null, 1))

  console.log('\n=== 管理员待办 ===')
  r = await call(gw, 'course', { action: 'adminTodo', token: admTok })
  console.log(JSON.stringify(r, null, 1).slice(0, 2000))
}

main().catch(e => console.error('FATAL', e))
