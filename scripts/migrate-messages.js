// 迁移：messages 表加 type/linkType/linkId/readAt 字段
// 以及 scripts/schema.sql 更新

const fs = require('fs'), path = require('path'), os = require('os')
const { tcb: tencentcloud } = require('../cloudfunctions/pgsetup/node_modules/tencentcloud-sdk-nodejs-tcb')

const ENV = 'profitable-newt-d2fl5wq6f366cf13'

async function main() {
  // 读凭证
  const authPath = path.join(os.homedir(), '.config/.cloudbase/auth.json')
  if (!fs.existsSync(authPath)) {
    console.error('auth.json 不存在，请先 tcb login')
    process.exit(1)
  }
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  const cred = auth.credential
  const client = new tencentcloud.v20180608.Client({
    credential: { secretId: cred.tmpSecretId, secretKey: cred.tmpSecretKey, token: cred.tmpToken },
    region: 'ap-shanghai',
    profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
  })

  const migrations = [
    // messages 表加字段
    { name: 'messages_type', sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT ''` },
    { name: 'messages_linkType', sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "linkType" text NOT NULL DEFAULT ''` },
    { name: 'messages_linkId', sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "linkId" text NOT NULL DEFAULT ''` },
    { name: 'messages_readAt', sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS "readAt" timestamptz` },
    { name: 'messages_toId_idx', sql: `CREATE INDEX IF NOT EXISTS messages_to_id_idx ON messages("toId")` },
    { name: 'messages_read_idx', sql: `CREATE INDEX IF NOT EXISTS messages_read_idx ON messages(read)` },
    { name: 'messages_createdAt_idx', sql: `CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages("createdAt" DESC)` }
  ]

  console.log('=== 开始迁移 messages 表 ===')
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
  // 检查是否已有新字段
  if (!schema.includes('"type" text NOT NULL DEFAULT \'\'')) {
    // 在 messages 表 readAt 字段后添加新字段（messages 表原结构在第 117-125 行）
    const oldMessages = `CREATE TABLE messages (
  id text PRIMARY KEY,
  "fromId" text NOT NULL DEFAULT '',
  "toId" text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);`
    const newMessages = `CREATE TABLE messages (
  id text PRIMARY KEY,
  "fromId" text NOT NULL DEFAULT '',
  "toId" text NOT NULL DEFAULT '',
  "type" text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  "linkType" text NOT NULL DEFAULT '',
  "linkId" text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_to_id_idx ON messages("toId");
CREATE INDEX messages_read_idx ON messages(read);
CREATE INDEX messages_created_at_idx ON messages("createdAt" DESC);`
    schema = schema.replace(oldMessages, newMessages)
    fs.writeFileSync(schemaPath, schema)
    console.log('  ✅ schema.sql 已同步更新 messages 表结构')
  } else {
    console.log('  ℹ️ schema.sql 已是最新')
  }

  console.log('\n=== 迁移完成 ===')
}

main().catch(e => console.error('FATAL:', e))
