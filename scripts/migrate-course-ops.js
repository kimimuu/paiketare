// 二期B：courses 表加 endReason + 索引
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

async function execSql(sql) {
  return client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql })
}

const MIGRATIONS = [
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS "endReason" text NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS courses_end_reason_idx ON courses("endReason")`
]

async function main() {
  for (const sql of MIGRATIONS) {
    try {
      await execSql(sql)
      console.log('[ok]', sql.slice(0, 80))
    } catch (e) {
      console.error('[fail]', sql.slice(0, 80), '->', e.message)
    }
  }
  const res = await execSql(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='courses' ORDER BY ordinal_position`)
  console.log('\ncourses columns:', JSON.stringify(res, null, 2))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
