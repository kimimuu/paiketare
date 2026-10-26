// 二期A：approvals 表扩展（submitterId/approverId/rejectReason + 索引）
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
  `ALTER TABLE approvals ADD COLUMN IF NOT EXISTS "submitterId" text NOT NULL DEFAULT ''`,
  `ALTER TABLE approvals ADD COLUMN IF NOT EXISTS "approverId" text NOT NULL DEFAULT ''`,
  `ALTER TABLE approvals ADD COLUMN IF NOT EXISTS "rejectReason" text NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS approvals_target_idx ON approvals("targetId")`,
  `CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status)`,
  `CREATE INDEX IF NOT EXISTS approvals_submitter_idx ON approvals("submitterId")`
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
  // 验证
  const res = await execSql(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='approvals' ORDER BY ordinal_position`)
  console.log('\napprovals columns:', JSON.stringify(res, null, 2))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
