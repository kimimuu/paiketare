// 公共鉴权模块：密码哈希 + token 签发/校验
const crypto = require('crypto')

// 部署时通过环境变量 TOKEN_SECRET 覆盖
const SECRET = process.env.TOKEN_SECRET || 'paike-dev-secret'

// ---- 密码哈希（scrypt）----
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const computed = crypto.scryptSync(password, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
}

// ---- token（HMAC 签名的简易 JWT 结构）----
function signToken(payload, expiresInSec = 7 * 24 * 3600) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSec }
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [encoded, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url')
  if (sig !== expected) return null
  const body = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  if (body.exp < Date.now() / 1000) return null
  return body
}

/**
 * 校验请求身份，失败抛错
 * @param {object} event 云函数入参（需含 token 字段）
 * @param {string} [role] 限定角色，如 'admin'
 */
function requireAuth(event, role) {
  const payload = verifyToken(event.token)
  if (!payload) {
    const err = new Error('登录已过期，请重新登录')
    err.code = 401
    throw err
  }
  if (role && payload.role !== role) {
    const err = new Error('无权限执行此操作')
    err.code = 403
    throw err
  }
  return payload
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth }
