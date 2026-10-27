// 查老师 campuses 和现有审批
const GW = 'https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com'
async function anonToken() {
  const res = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'd3' }, body: '{}'
  })
  return (await res.json()).access_token
}
async function call(name, data, gwToken) {
  const res = await fetch(`${GW}/v1/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'd3', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return res.json()
}
async function main() {
  const gw = await anonToken()
  const admTok = (await call('auth', { action:'login', phone:'13800000000', password:'admin123456' }, gw)).data.token
  const zhangTok = (await call('auth', { action:'login', phone:'13900000001', password:'zhang123456' }, gw)).data.token

  // 查校区列表 + baseData
  let r = await call('baseData', { action:'listCampuses', token: admTok }, gw)
  console.log('=== 所有校区 ===')
  for (const c of (r.data?.list || [])) console.log(`  ${c.campusId} ${c.name}`)

  // 查张老师 campuses
  r = await call('availability', { action:'listMy', token: zhangTok }, gw)
  console.log('\n=== 张老师 campuses ===')
  console.log('campuses:', r.data?.campuses || [])
  console.log('slots:', (r.data?.slots || []).length, '条')
  for (const s of (r.data?.slots || []).slice(0,5)) console.log(`  ${s.type} ${s.weekday||s.date} ${s.startTime}-${s.endTime}`)

  // 查张老师的审批历史
  r = await call('availability', { action:'listMyApprovals', token: zhangTok }, gw)
  console.log('\n=== 张老师审批 ===')
  for (const a of (r.data?.list || []).slice(0,5)) console.log(`  ${a.approvalId} status=${a.status} createdAt=${a.createdAt}`)
}
main().catch(e=>console.error(e))
