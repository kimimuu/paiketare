// setup 云函数：初始化数据库集合（幂等，已存在则跳过）
const cloud = require('@cloudbase/node-sdk')
const app = cloud.init({ env: process.env.TCB_ENV || cloud.SYMBOL_CURRENT_ENV })
const db = app.database()

const COLLECTIONS = [
  'users', 'teachers', 'campuses', 'availabilities',
  'students', 'courses', 'sessions', 'approvals', 'messages'
]

exports.main = async () => {
  const results = {}
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      results[name] = '已创建'
    } catch (e) {
      // 集合已存在时腾讯云返回错误，视为成功
      results[name] = '已存在'
    }
  }
  return { code: 0, data: results }
}
