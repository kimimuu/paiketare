// 迁移：availabilities 表加 kind 字段（normal/blocked）
// normal = 可用时段（参与排课）
// blocked = 不接课（排课时算占用）

const fs = require('fs'), path = require('path'), os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV = 'profitable-newt-d2fl5wq6f366cf13'

async function main() {
  const authPath = path.join(os.homedir(), '.config/.cloudbase/auth.json')
  if (!fs.existsSync(authPath)) { console.error('auth.json 不存在'); process.exit(1) }
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  const cred = auth.credential
  const client = new tencentcloud.v20180608.Client({
    credential: { secretId: cred.tmpSecretId, secretKey: cred.tmpSecretKey, token: cred.tmpToken },
    region: 'ap-shanghai',
    profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
  })

  const migrations = [
    { name: 'availabilities_kind', sql: `ALTER TABLE availabilities ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'normal'` }
  ]

  console.log('=== 迁移 availabilities 表：加 kind 字段 ===')
  for (const m of migrations) {
    try {
      const r = await client.ExecutePGSql({ EnvId: ENV, Sql: m.sql })
      console.log(`  ✅ ${m.name} → ${r.error ? r.error.message : 'OK'}`)
    } catch (e) {
      console.log(`  ❌ ${m.name} → ${e.message}`)
    }
  }

  // 同步 schema.sql
  const schemaPath = path.join(__dirname, 'schema.sql')
  let schema = fs.readFileSync(schemaPath, 'utf8')
  if (!schema.includes('"kind" text')) {
    const oldAvail = `CREATE TABLE availabilities (
  id text PRIMARY KEY,
  "teacherId" text NOT NULL,
  type text NOT NULL,
  weekday integer,
  date text,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "approvalStatus" text NOT NULL DEFAULT 'approved',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()`
    const newAvail = `CREATE TABLE availabilities (
  id text PRIMARY KEY,
  "teacherId" text NOT NULL,
  type text NOT NULL,
  weekday integer,
  date text,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "approvalStatus" text NOT NULL DEFAULT 'approved',
  "kind" text NOT NULL DEFAULT 'normal',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()`
    schema = schema.replace(oldAvail, newAvail)
    fs.writeFileSync(schemaPath, schema)
    console.log('  ✅ schema.sql 已同步更新 availabilities 表结构')
  } else {
    console.log('  ℹ️ schema.sql 已是最新')
  }

  console.log('\n=== 迁移完成 ===')
}

main().catch(e => console.error('FATAL:', e))
