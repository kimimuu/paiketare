// Netlify Edge Function: API proxy for CloudBase Gateway
// 浏览器 fetch 会自动加 Origin/Referer，CloudBase Gateway 拒绝非白名单来源的跨域请求
// 这个 Edge Function 剥离 Origin/Referer 后再转发，绕过 CORS 检查
export default async function handler(request) {
  const gatewayHost = 'https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com'
  const url = new URL(request.url)
  
  // 构造目标 URL：把 /api/xxx → Gateway 的 /xxx
  const targetPath = url.pathname.replace(/^\/api/, '')
  const target = gatewayHost + targetPath + url.search
  
  // 只保留 CloudBase Gateway 需要的 headers，剥离 Origin/Referer
  const headers = new Headers()
  for (const [k, v] of request.headers.entries()) {
    const lower = k.toLowerCase()
    if (lower === 'origin' || lower === 'referer') continue
    if (lower === 'host') headers.set('Host', gatewayHost.replace(/^https?:\/\//, ''))
    else headers.set(k, v)
  }
  
  // 转发请求
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual'
  })
  
  // 构造返回，复制状态码和非 hop-by-hop headers
  const respHeaders = new Headers()
  for (const [k, v] of response.headers.entries()) {
    const lower = k.toLowerCase()
    // 剥离可能引起混淆的头
    if (lower === 'location' || lower === 'content-encoding') continue
    respHeaders.set(k, v)
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders
  })
}
