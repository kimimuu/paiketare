// Gateway REST API 封装
// 前端走相对路径 /api/*，由 Netlify 代理转发到 CloudBase Gateway，彻底绕开 CORS
// （之前 CloudBase SDK 在 Netlify 域名下被 Gateway 以 403 拒绝跨域请求）

const API_BASE = '/api'

// 缓存网关匿名 token，过期前自动刷新
let gwToken = null
let gwTokenPromise = null

async function ensureGwToken() {
  if (gwToken) return gwToken
  if (!gwTokenPromise) {
    gwTokenPromise = (async () => {
      const res = await fetch(`${API_BASE}/auth/v1/signin/anonymously`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'web' },
        body: '{}'
      })
      const body = await res.json()
      if (!body.access_token) throw new Error('匿名登录失败: ' + JSON.stringify(body))
      gwToken = body.access_token
      // token 一般 1 小时有效，提前 5 分钟清掉让下次 call 自动刷新
      setTimeout(() => { gwToken = null }, 55 * 60 * 1000)
      return gwToken
    })().finally(() => { gwTokenPromise = null })
  }
  return gwTokenPromise
}

/**
 * 调用云函数（统一入口），自动附带业务 token
 * @param {string} name 云函数名
 * @param {object} data 入参（含 action 字段区分函数内操作）
 */
export async function call(name, data = {}) {
  const token = localStorage.getItem('token') || ''
  const gw = await ensureGwToken()
  const res = await fetch(`${API_BASE}/v1/functions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': 'web',
      Authorization: `Bearer ${gw}`
    },
    body: JSON.stringify({ ...data, token })
  })
  const body = await res.json()
  if (res.status !== 200 || body.code === undefined) {
    throw new Error(`网关调用 ${name} 失败 HTTP ${res.status}`)
  }
  if (body.code !== 0) {
    if (body.code === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      location.href = '/login'
    }
    throw new Error(body.message || '请求失败')
  }
  return body.data ?? null
}
