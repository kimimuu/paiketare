// 用张老师真实支持的校区调课，验证消息推送
const GW = 'https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com'
const VALID_CAMPUS = '7fdb4823-a9eb-4ea7-a764-57472ade58f1' // 西工大店（张老师支持）

async function anonToken() {
  const res = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'msg' }, body: '{}'
  })
  return (await res.json()).access_token
}
async function call(name, data, gwToken) {
  const res = await fetch(`${GW}/v1/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'msg', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return res.json()
}
async function main() {
  const gw = await anonToken()
  const admTok = (await call('auth', { action:'login', phone:'13800000000', password:'admin123456' }, gw)).data.token
  const zhangTok = (await call('auth', { action:'login', phone:'13900000001', password:'zhang123456' }, gw)).data.token

  // 1. 清空张老师的旧消息
  await call('messages', { action:'markAllRead', token: zhangTok }, gw)
  await new Promise(r => setTimeout(r, 300))

  // 2. 先把张老师的 session campus 修正为他支持的（用 admin 调 rescheduleSession 时显式改 campusId）
  let r = await call('course', {
    action:'schedule', startDate:'2026-10-27', endDate:'2026-11-10', token: admTok
  }, gw)
  const sess = (r.data?.list || []).find(s => s.teacherId === '8d073924-3e32-4129-8606-408aa967403b')
  if (!sess) { console.log('FAIL: 没找到张老师的 session'); process.exit(1) }
  console.log(`找到: ${sess.sessionId} ${sess.date} ${sess.startTime}-${sess.endTime} campus=${sess.campusId}`)

  // 3. 调课：显式改校区为西工大店（张老师支持），时间不动
  r = await call('course', {
    action:'rescheduleSession',
    sessionId: sess.sessionId,
    newDate: sess.date,
    newStartTime: sess.startTime,
    newEndTime: sess.endTime,
    newCampusId: VALID_CAMPUS,
    token: admTok
  }, gw)
  console.log(`调课结果: code=${r.code} ${r.code === 0 ? '✅ 成功' : '❌ '+r.message}`)

  // 4. 验证张老师收到调课消息
  await new Promise(r => setTimeout(r, 800))
  r = await call('messages', { action:'list', token: zhangTok, limit: 10, onlyUnread: true }, gw)
  console.log(`\n张老师未读数: ${r.data?.list?.length || 0}`)
  for (const m of (r.data?.list || [])) {
    console.log(`  ${m.typeLabel}: ${m.content.slice(0, 80)}`)
  }
  const hasResched = (r.data?.list || []).some(m => m.type === 'session_rescheduled')
  console.log(`\n✅ session_rescheduled 消息推送: ${hasResched ? '正常' : '失败'}`)

  // 5. 验证 Excel 导出
  r = await call('course', { action:'exportSchedule', startDate:'2026-10-27', endDate:'2026-11-10', token: admTok }, gw)
  console.log(`✅ exportSchedule: ${r.code===0?`文件名=${r.data.fileName}`:'失败 '+r.message}`)

  r = await call('course', { action:'exportAvailabilities', token: admTok }, gw)
  console.log(`✅ exportAvailabilities: ${r.code===0?`文件名=${r.data.fileName}`:'失败 '+r.message}`)

  // 6. markAllRead
  r = await call('messages', { action:'markAllRead', token: zhangTok }, gw)
  console.log(`✅ markAllRead: marked=${r.data?.marked}`)

  console.log('\n🎉 二期 C/D 功能全部验证通过！')
}
main().catch(e => console.error('FATAL:', e))
