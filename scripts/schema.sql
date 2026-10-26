-- 排课系统 PG schema（public schema，camelCase 列名 = JSON 键，rdb 通道不做大小写转换）
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS campuses CASCADE;
DROP TABLE IF EXISTS availabilities CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS messages CASCADE;

CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  salt text NOT NULL,
  hash text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  "needChangePassword" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_phone_uidx ON users(phone);
CREATE INDEX users_role_idx ON users(role);

CREATE TABLE teachers (
  id text PRIMARY KEY,
  "userId" text NOT NULL,
  campuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teachers_user_uidx ON teachers("userId");

CREATE TABLE campuses (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campuses_name_idx ON campuses(name);

CREATE TABLE availabilities (
  id text PRIMARY KEY,
  "teacherId" text NOT NULL,
  type text NOT NULL,
  weekday integer,
  date text,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "approvalStatus" text NOT NULL DEFAULT 'approved',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avail_teacher_idx ON availabilities("teacherId");

CREATE TABLE students (
  id text PRIMARY KEY,
  name text NOT NULL,
  "campusId" text,
  phone text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_campus_idx ON students("campusId");

CREATE TABLE courses (
  id text PRIMARY KEY,
  type text NOT NULL,
  "studentId" text NOT NULL,
  "teacherId" text NOT NULL,
  "campusId" text NOT NULL,
  duration integer NOT NULL,
  "totalSessions" integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_status_idx ON courses(status);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  "courseId" text NOT NULL,
  "teacherId" text NOT NULL,
  "campusId" text NOT NULL,
  date text NOT NULL,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_teacher_date_idx ON sessions("teacherId", date);
CREATE INDEX sessions_course_idx ON sessions("courseId");
CREATE INDEX sessions_date_idx ON sessions(date);

CREATE TABLE approvals (
  id text PRIMARY KEY,
  type text NOT NULL DEFAULT '',
  "targetId" text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  "submitterId" text NOT NULL DEFAULT '',
  "approverId" text NOT NULL DEFAULT '',
  "rejectReason" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_target_idx ON approvals("targetId");
CREATE INDEX approvals_status_idx ON approvals(status);
CREATE INDEX approvals_submitter_idx ON approvals("submitterId");

CREATE TABLE messages (
  id text PRIMARY KEY,
  "fromId" text NOT NULL DEFAULT '',
  "toId" text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- rpc 探针：返回实际连接身份
CREATE OR REPLACE FUNCTION pg_identity_probe() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT current_user || '|' || session_user || '|' || coalesce(current_setting('request.jwt.claims', true), '')
$fn$;

-- 表级权限：rdb 通道角色全放行（RLS policy 另行放行）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, cloudbase_authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, cloudbase_authenticator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role, cloudbase_authenticator;
