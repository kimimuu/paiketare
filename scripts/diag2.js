// 精确查哪些 session 可以调
const GW = 'https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com'
async function anonToken() {
  const res = await fetch(`${GW}/auth/v1/signin/anonymously`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'diag2' }, body: '{}'
  })
  return (await res.json()).access_token
}
async function call(name, data, gwToken) {
  const res = await fetch(`${GW}/v1/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'diag2', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return res.json()
}
async function main() {
  const gw = await anonToken()
  let r = await call('auth', { action:'login', phone:'13800000000', password:'admin123456' }, gw)
  const adm = r.data.token

  const today = new Date()
  const y=today.getFullYear(); const m=String(today.getMonth()+1).padStart(2,'0'); const d=String(today.getDate()).padStart(2,'0')
  const endDate = new Date(today.getTime()+14*86400000); const ey=endDate.getFullYear(); const em=String(endDate.getMonth()+1).padStart(2,'0'); const ed=String(Math.min(28,endDate.getDate())).padStart(2,'0')

  r = await call('course', { action:'schedule', startDate:`${y}-${m}-${d}`, endDate:`${ey}-${em}-${ed}`, token: adm }, gw)
  console.log('=== sessions ===')
  console.log(JSON.stringify(r.data?.list || r, null, 2).slice(0,3000))

  r = await call('auth', { action:'listTeachers', token: adm }, gw)
  console.log('\n=== teachers ===')
  for (const t of (r.data?.list || [])) console.log(`  ${t.uid} ${t.name} campusCount=${t.campusCount} phone=${t.phone}`)
}
main().catch(e=>console.error(e))
