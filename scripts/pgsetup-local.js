// 本地执行 PG 建表（使用 tcb CLI 登录凭证调 ExecutePGSql）
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'
const REGION = 'ap-shanghai'

const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential

const client = new tencentcloud.v20180608.Client({
  credential: {
    secretId: cred.tmpSecretId,
    secretKey: cred.tmpSecretKey,
    token: cred.tmpToken
  },
  region: REGION,
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function execSql(sql) {
  return client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql })
}

const TABLES = ['users', 'teachers', 'campuses', 'availabilities', 'students', 'courses', 'sessions', 'approvals', 'messages']

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

function rlsSqlFor(t) {
  return `
ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
DO $d$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${t}' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON ${t} FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $d$;
`
}

async function runBatch(name, sql, splitFallback) {
  try {
    await execSql(sql)
    console.log(`[ok] ${name}`)
    return true
  } catch (e) {
    console.error(`[fail] ${name}: ${e.message} (code=${e.code})`)
    if (!splitFallback) return false
    const stmts = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'))
    const errs = []
    for (const s of stmts) {
      try {
        await execSql(s)
      } catch (e2) {
        errs.push({ sql: s.replace(/\s+/g, ' ').slice(0, 100), error: e2.message })
      }
    }
    if (errs.length) console.error('  per-statement errors:', JSON.stringify(errs, null, 2))
    return errs.length === 0
  }
}

async function main() {
  // 1. schema
  await runBatch('schema', SCHEMA_SQL, true)

  // 2. RLS
  for (const t of TABLES) {
    await runBatch(`rls_${t}`, rlsSqlFor(t), true)
  }

  // 3. 验证表清单
  try {
    const res = await execSql(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
    console.log('tables:', JSON.stringify(res, null, 2))
  } catch (e) {
    console.error('verify failed:', e.message)
  }
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
