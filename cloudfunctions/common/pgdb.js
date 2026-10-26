// 公共数据模块（PostgreSQL rdb / PostgREST）
const cloud = require('@cloudbase/node-sdk')
const crypto = require('crypto')

const app = cloud.init({
  env: process.env.TCB_ENV || cloud.SYMBOL_CURRENT_ENV
})
const rdb = app.rdb()

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

function genId() {
  return crypto.randomUUID()
}

// ---- 过滤操作符 ----
const F = {
  in: arr => ({ __op: 'in', arr }),
  neq: v => ({ __op: 'neq', v }),
  gte: v => ({ __op: 'gte', v }),
  lte: v => ({ __op: 'lte', v }),
  and: (...parts) => ({ __op: 'and', parts })
}

function applyFilter(q, col, cond) {
  if (cond && typeof cond === 'object' && cond.__op) {
    switch (cond.__op) {
      case 'in': return q.in(col, cond.arr)
      case 'neq': return q.neq(col, cond.v)
      case 'gte': return q.gte(col, cond.v)
      case 'lte': return q.lte(col, cond.v)
      case 'and':
        for (const p of cond.parts) q = applyFilter(q, col, p)
        return q
    }
  }
  return q.eq(col, cond)
}

// 统一错误处理
function check(res) {
  if (res.error) {
    const err = new Error(`数据库错误: ${res.error.message || res.error}`)
    err.code = 500
    throw err
  }
  return res.data
}

/**
 * 通用查询（自动分页拉全）
 * @param {string} table 表名
 * @param {object} where 过滤条件（值为等值，或用 F 操作符）
 * @param {object} opts { limit=1000, orderBy, orderDir='asc', select='*' }
 * @returns {Promise<Array>} 行数组
 */
async function queryAll(table, where = {}, opts = {}) {
  const { limit = 1000, orderBy, orderDir = 'asc', select = '*' } = opts
  const PAGE = 1000
  const all = []
  let offset = 0
  while (true) {
    let q = rdb.from(table).select(select)
    for (const [col, cond] of Object.entries(where)) q = applyFilter(q, col, cond)
    if (orderBy) q = q.order(orderBy, { ascending: orderDir !== 'desc' })
    q = q.range(offset, offset + PAGE - 1)
    const data = check(await q) || []
    all.push(...data)
    if (data.length < PAGE || all.length >= limit) break
    offset += PAGE
  }
  return all
}

// 单条插入：自动生成 id 与时间戳；返回 { id }
async function insertOne(table, data) {
  const now = new Date().toISOString()
  const row = { id: genId(), createdAt: now, updatedAt: now, ...data }
  check(await rdb.from(table).insert(row))
  return { id: row.id }
}

// 按 id 更新（自动 updatedAt）
async function updateById(table, id, data) {
  check(await rdb.from(table).update({ updatedAt: new Date().toISOString(), ...data }).eq('id', id))
  return true
}

// 按 id 删除
async function removeById(table, id) {
  check(await rdb.from(table).delete().eq('id', id))
  return true
}

module.exports = { rdb, F, COLLECTIONS, genId, queryAll, insertOne, updateById, removeById }
