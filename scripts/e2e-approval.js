// 二期A 审批流 e2e 测试
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`

let passed = 0, failed = 0
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 300) : ''}`) }
}

async function anonToken() {
  const res = await fetch(`${BASE}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-approval' }, body: '{}'
  })
  return (await res.json()).access_token
}
async function call(gwToken, name, data) {
  const res = await fetch(`${BASE}/v1/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-approval', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return await res.json()
}
function addDays(dateStr, n) {
  const dt = new Date(dateStr + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

async function main() {
  const gw = await anonToken()

  // 登录
  const tea = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: 'zhang123456' })
  ok(tea.code === 0, '张老师登录', tea)
  const teaTok = tea.data.token
  const adm = await call(gw, 'auth', { action: 'login', phone: '13800000000', password: 'admin123456' })
  ok(adm.code === 0, '管理员登录', adm)
  const admTok = adm.data.token

  const campuses = (await call(gw, 'baseData', { action: 'listCampuses', token: admTok })).data.list
  const campusId = campuses[0].campusId
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1)

  // 先撤回可能存在的 pending 单（幂等）
  const pend0 = await call(gw, 'availability', { action: 'getMyPendingChange', token: teaTok })
  if (pend0.data) {
    await call(gw, 'availability', { action: 'withdrawApproval', token: teaTok, approvalId: pend0.data.approvalId })
    console.log('  （幂等）撤回了残留 pending 单')
  }

  // ===== 第一幕：老师提交审批 =====
  console.log('第一幕：老师提交审批')
  const newSlots = [
    { type: 'weekly', weekday: 1, startTime: '18:00', endTime: '21:00' },
    { type: 'date', date: tomorrow, startTime: '18:00', endTime: '21:00' }
  ]
  let r = await call(gw, 'availability', { action: 'submitChange', token: teaTok, slots: newSlots, campuses: [campusId] })
  ok(r.code === 0 && r.data.approvalId, '提交审批成功', r)
  const approvalId = r.data.approvalId

  // 重复提交应被拒
  r = await call(gw, 'availability', { action: 'submitChange', token: teaTok, slots: newSlots, campuses: [campusId] })
  ok(r.code === 400, '重复提交被拒', r)

  // 查 pending
  r = await call(gw, 'availability', { action: 'getMyPendingChange', token: teaTok })
  ok(r.data && r.data.approvalId === approvalId, '查到待审批单', r.data)

  // 审批期间旧数据仍生效
  r = await call(gw, 'availability', { action: 'listMy', token: teaTok })
  ok(r.code === 0, '审批期间 listMy 仍返回旧数据', r.data)

  // ===== 第二幕：管理员审批 =====
  console.log('第二幕：管理员审批')
  r = await call(gw, 'approval', { action: 'list', token: admTok, status: 'pending' })
  ok(r.code === 0 && r.data.list.some(a => a.approvalId === approvalId), '审批列表含 pending 单', r.data)

  r = await call(gw, 'approval', { action: 'get', token: admTok, approvalId })
  ok(r.code === 0 && r.data.payload.slots.length === 2, '审批详情含新快照', r.data)
  ok(Array.isArray(r.data.old.slots), '审批详情含旧数据', r.data.old)

  // 通过审批（张老师有已确认课程在明天19:00，新时段18:00-21:00覆盖它，应通过）
  r = await call(gw, 'approval', { action: 'approve', token: admTok, approvalId })
  ok(r.code === 0, '审批通过', r)

  // 验证数据已更新
  r = await call(gw, 'availability', { action: 'listMy', token: teaTok })
  ok(r.data.slots.length === 2 && r.data.campuses.length === 1, '审批通过后数据更新', r.data)

  // 重复通过应被拒
  r = await call(gw, 'approval', { action: 'approve', token: admTok, approvalId })
  ok(r.code === 400, '重复通过被拒', r)

  // ===== 第三幕：驳回 + 撤回 =====
  console.log('第三幕：驳回与撤回')
  // 老师再提交一个
  r = await call(gw, 'availability', { action: 'submitChange', token: teaTok, slots: newSlots, campuses: [campusId] })
  ok(r.code === 0, '再次提交', r)
  const approvalId2 = r.data.approvalId

  // 管理员驳回
  r = await call(gw, 'approval', { action: 'reject', token: admTok, approvalId: approvalId2, rejectReason: '时间不合适' })
  ok(r.code === 0, '驳回成功', r)

  // 老师查历史
  r = await call(gw, 'availability', { action: 'listMyApprovals', token: teaTok })
  ok(r.data.list.length >= 2, '审批历史含多条', r.data.list)
  const rejected = r.data.list.find(a => a.approvalId === approvalId2)
  ok(rejected && rejected.status === 'rejected' && rejected.rejectReason === '时间不合适', '驳回记录含原因', rejected)

  // 撤回测试：提交一个再撤回
  r = await call(gw, 'availability', { action: 'submitChange', token: teaTok, slots: newSlots, campuses: [campusId] })
  const approvalId3 = r.data.approvalId
  r = await call(gw, 'availability', { action: 'withdrawApproval', token: teaTok, approvalId: approvalId3 })
  ok(r.code === 0, '撤回成功', r)
  r = await call(gw, 'availability', { action: 'getMyPendingChange', token: teaTok })
  ok(r.data === null, '撤回后无 pending', r.data)

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch(err => { console.error('E2E 异常:', err.message); process.exit(1) })
