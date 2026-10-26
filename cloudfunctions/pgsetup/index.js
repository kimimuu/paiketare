// pgsetup：通过 ExecutePGSql 云 API 建 9 张 PG 表 + 索引 + RLS 放行 policy + 探针函数
const tencentcloud = require('tencentcloud-sdk-nodejs-tcb')

const ENV_ID = process.env.TCB_ENV || 'profitable-newt-d2fl5wq6f366cf13'
const REGION = 'ap-shanghai'

const TcbClient = tencentcloud.tcb.v20180608.Client

const client = new TcbClient({
  credential: {
    secretId: process.env.TENCENTCLOUD_SECRETID,
    secretKey: process.env.TENCENTCLOUD_SECRETKEY,
    token: process.env.TENCENTCLOUD_SESSION_TOKEN
  },
  region: REGION,
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com' } }
})

async function execSql(sql) {
  const res = await client.ExecutePGSql({ EnvId: ENV_ID, Sql: sql })
  return res
}

const TABLES = ['users', 'teachers', 'campuses', 'availabilities', 'students', 'courses', 'sessions', 'approvals', 'messages']

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  salt text NOT NULL,
  hash text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  need_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users(phone);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS teachers (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  campuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_user_uidx ON teachers(user_id);

CREATE TABLE IF NOT EXISTS campuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campuses_name_idx ON campuses(name);

CREATE TABLE IF NOT EXISTS availabilities (
  id text PRIMARY KEY,
  teacher_id text NOT NULL,
  type text NOT NULL,
  weekday integer,
  date text,
  start_time text NOT NULL,
  end_time text NOT NULL,
  approval_status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avail_teacher_idx ON availabilities(teacher_id);

CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY,
  name text NOT NULL,
  campus_id text,
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_campus_idx ON students(campus_id);

CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  type text NOT NULL,
  student_id text NOT NULL,
  teacher_id text NOT NULL,
  campus_id text NOT NULL,
  duration integer NOT NULL,
  total_sessions integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_status_idx ON courses(status);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  teacher_id text NOT NULL,
  campus_id text NOT NULL,
  date text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_teacher_date_idx ON sessions(teacher_id, date);
CREATE INDEX IF NOT EXISTS sessions_course_idx ON sessions(course_id);
CREATE INDEX IF NOT EXISTS sessions_date_idx ON sessions(date);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  from_id text NOT NULL DEFAULT '',
  to_id text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- rpc 探针：返回实际连接身份
CREATE OR REPLACE FUNCTION pg_identity_probe() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT current_user || '|' || session_user || '|' || coalesce(current_setting('request.jwt.claims', true), '')
$fn$;
`

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

exports.main = async () => {
  const out = { steps: [] }
  try {
    // 1. 整个 schema 一次执行
    await execSql(SCHEMA_SQL)
    out.steps.push({ step: 'schema', ok: true })
  } catch (e) {
    out.steps.push({ step: 'schema_batch', ok: false, error: e.message, code: e.code })
    // 2. 逐条执行定位错误
    const stmts = SCHEMA_SQL.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'))
    const errors = []
    for (const s of stmts) {
      try {
        await execSql(s)
      } catch (e2) {
        errors.push({ sql: s.slice(0, 120), error: e2.message })
      }
    }
    out.steps.push({ step: 'schema_per_statement', errors })
  }

  // 3. RLS
  for (const t of TABLES) {
    try {
      await execSql(rlsSqlFor(t))
      out.steps.push({ step: `rls_${t}`, ok: true })
    } catch (e) {
      out.steps.push({ step: `rls_${t}`, ok: false, error: e.message })
    }
  }

  // 4. 验证：查表清单
  try {
    const res = await execSql(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
    out.tables = res
  } catch (e) {
    out.verifyError = e.message
  }
  return out
}
