// 清理脚本：把 2026-10-27/28 所有张老师/李老师的 sessions 置为 cancelled，courses 置为 rejected
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'
const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential
const client = new tencentcloud.v20180608.Client({
  credential: { secretId: cred.tmpSecretId, secretKey: cred.tmpSecretKey, token: cred.tmpToken },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function execSql(sql) { return client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql }) }

async function main() {
  // 清理所有未来的 pending/confirmed sessions 和 courses
  const sqls = [
    `SELECT COUNT(*) FROM sessions WHERE date::date >= CURRENT_DATE AND status IN ('pending', 'confirmed')`,
    `UPDATE sessions SET status = 'cancelled', "updatedAt" = now() WHERE date::date >= CURRENT_DATE AND status IN ('pending', 'confirmed')`,
    `UPDATE courses SET status = 'cancelled', "endReason" = 'e2e_cleanup', "updatedAt" = now() WHERE status IN ('pending', 'confirmed') AND id IN (SELECT DISTINCT "courseId" FROM sessions WHERE date::date >= CURRENT_DATE)`
  ]
  for (const sql of sqls) {
    console.log('SQL:', sql.slice(0, 80))
    const r = await execSql(sql)
    console.log('Result:', JSON.stringify(r).slice(0, 300))
  }
  console.log('Done')
}

main().catch(e => console.error(e))
