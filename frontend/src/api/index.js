import cloudbase from '@cloudbase/js-sdk'

// CloudBase 环境ID
export const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'

const app = cloudbase.init({ env: ENV_ID })
export const auth = app.auth({ persistence: 'local' })
export const db = app.database()

// 匿名登录（用于获得 SDK 调用凭证，业务身份由自定义 token 管理）
let loginPromise = null
async function ensureLogin() {
  const state = await auth.getLoginState()
  if (state) return
  if (!loginPromise) {
    loginPromise = auth.anonymousAuthProvider().signIn().finally(() => {
      loginPromise = null
    })
  }
  await loginPromise
}

/**
 * 调用云函数（统一入口），自动附带业务 token
 * @param {string} name 云函数名
 * @param {object} data 入参（含 action 字段区分函数内操作）
 */
export async function call(name, data = {}) {
  await ensureLogin()
  const token = localStorage.getItem('token') || ''
  const res = await app.callFunction({ name, data: { ...data, token } })
  const body = res.result
  if (body && body.code !== 0) {
    if (body.code === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      location.href = '/login'
    }
    throw new Error(body.message || '请求失败')
  }
  return body ? body.data : null
}
