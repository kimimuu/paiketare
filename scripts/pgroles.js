// 查 PG 角色列表（决定 GRANT 对象）
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential

const client = new tencentcloud.v20180608.Client({
  credential: {
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    token: cred.tmpToken
  },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function main() {
  const res = await client.ExecutePGSql({
    EnvId: 'profitable-newt-d2fl5wq6f366cf13',
    Sql: `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY rolname`
  })
  console.log(JSON.stringify(res, null, 2))
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
