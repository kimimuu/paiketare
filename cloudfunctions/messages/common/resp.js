// 统一响应格式：{ code, data, message, ...extra }
// 约定：code=0 成功；401 未登录；403 无权限；400 参数错误；500 服务器错误

function ok(data) {
  return { code: 0, data }
}

function fail(message, code = 400, extra = {}) {
  return { code, message, ...extra }
}

// 包装云函数处理器，统一异常捕获
function wrap(handler) {
  return async (event, context) => {
    try {
      const data = await handler(event, context)
      return ok(data)
    } catch (err) {
      console.error(err)
      // 提取 Error 上挂载的附加字段（如 conflicts）
      const extra = {}
      for (const k of Object.keys(err)) {
        if (!['message', 'code', 'stack', 'name'].includes(k)) extra[k] = err[k]
      }
      return fail(err.message || '服务器错误', err.code || 500, extra)
    }
  }
}

module.exports = { ok, fail, wrap }
