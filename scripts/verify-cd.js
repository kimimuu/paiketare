// 二期 C+D 快速验证脚本
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`

let passed = 0, failed = 0
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0,300) : ''}`) }
}

async function anonToken() {
  const res = await fetch(`${BASE}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'verify' }, body: '{}'
  })
  const body = await res.json()
  if (!body.access_token) throw new Error('匿名登录失败: ' + JSON.stringify(body))
  return body.access_token
}

async function call(gwToken, name, data) {
  const res = await fetch(`${BASE}/v1/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'verify', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  const body = await res.json()
  return { status: res.status, ...body }
}

async function main() {
  console.log('=== 二期 C+D 快速验证 ===\n')

  let gw
  try { gw = await anonToken(); ok(true, '匿名网关 token 获取') }
  catch(e) { ok(false, '匿名网关 token 获取', e.message); return }

  // 1. 管理员登录
  let admTok
  {
    const r = await call(gw, 'auth', { action: 'login', phone: '13800000000', password: 'admin123456' })
    ok(r.code === 0, '管理员登录', r)
    admTok = r.data?.token
  }

  // 2. 老师登录
  let teaTok
  {
    const r = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: 'zhang123456' })
    ok(r.code === 0, '张老师登录', r)
    teaTok = r.data?.token
  }

  console.log('\n--- C 子项目: Excel 导出 ---')

  // 3. exportSchedule
  {
    const today = new Date().toISOString().slice(0,10)
    const r = await call(gw, 'course', { action: 'exportSchedule', token: admTok, startDate: today, endDate: today })
    ok(r.code === 0, 'exportSchedule 调用', { code: r.code, msg: r.message, keys: Object.keys(r.data || {}) })
    if (r.code === 0 && r.data) {
      ok(!!r.data.dataUrl && r.data.dataUrl.startsWith('data:'), 'exportSchedule 返回 dataUrl')
      ok(!!r.data.fileName && r.data.fileName.endsWith('.xlsx'), 'fileName 正确', r.data.fileName)
    }
  }

  // 4. exportAvailabilities
  {
    const r = await call(gw, 'course', { action: 'exportAvailabilities', token: admTok })
    ok(r.code === 0, 'exportAvailabilities 调用', { code: r.code, msg: r.message })
    if (r.code === 0 && r.data) {
      ok(!!r.data.dataUrl && r.data.dataUrl.startsWith('data:'), 'exportAvailabilities 返回 dataUrl')
    }
  }

  console.log('\n--- D 子项目: 站内消息 ---')

  // 5. messages.list (老师)
  {
    const r = await call(gw, 'messages', { action: 'list', token: teaTok })
    ok(r.code === 0, 'messages.list (老师)', { code: r.code, msg: r.message, count: r.data?.list?.length })
    if (r.code === 0 && r.data?.list?.length > 0) {
      const msg = r.data.list[0]
      ok('type' in msg && 'readAt' in msg, '消息含新字段(type/readAt)', msg)
    } else if (r.code === 0) {
      ok(true, '（空列表 OK）')
    }
  }

  // 6. unreadCount
  {
    const r = await call(gw, 'messages', { action: 'unreadCount', token: teaTok })
    ok(r.code === 0, 'messages.unreadCount', r)
    if (r.code === 0) ok(typeof r.data?.count === 'number', '返回数字 count', r.data)
  }

  // 7. markAllRead
  {
    const r = await call(gw, 'messages', { action: 'markAllRead', token: teaTok })
    ok(r.code === 0, 'messages.markAllRead', r)
  }

  // 8. messages.list (admin)
  {
    const r = await call(gw, 'messages', { action: 'list', token: admTok })
    ok(r.code === 0, 'messages.list (管理员)', { code: r.code, msg: r.message, count: r.data?.list?.length })
  }

  console.log('\n=== 汇总 ===')
  console.log(`  通过: ${passed}  失败: ${failed}`)
  if (failed > 0) console.log('  ⚠️ 有失败项，需排查')
  else console.log('  ✅ 全部通过！云函数部署 + 数据库迁移 都 OK')
}

main().catch(e => { console.error('💥 脚本崩溃:', e); process.exit(1) })
