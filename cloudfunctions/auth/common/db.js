// 公共数据库模块
const cloud = require('@cloudbase/node-sdk')

const app = cloud.init({
  env: process.env.TCB_ENV || cloud.SYMBOL_CURRENT_ENV
})
const db = app.database()
const _ = db.command

const COLLECTIONS = {
  users: 'users',
  teachers: 'teachers',
  campuses: 'campuses',
  availabilities: 'availabilities',
  students: 'students',
  courses: 'courses',
  sessions: 'sessions',
  approvals: 'approvals',
  messages: 'messages'
}

module.exports = { db, _, COLLECTIONS }
