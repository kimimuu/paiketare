// 配置 COS 桶直链访问：公有读 + 静态网站(index.html 回退) + CORS
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const BUCKET = '245d-static-profitable-newt-d2fl5wq6f366cf13-1318599542'
const REGION = 'ap-shanghai'
const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential

function sha1(s) { return crypto.createHash('sha1').update(s, 'utf8').digest('hex') }
function hmacSha1(key, s) { return crypto.createHmac('sha1', key).update(s, 'utf8').digest('hex') }

function cosSign({ method, pathname, params = {}, headers = {} }) {
  const now = Math.floor(Date.now() / 1000)
  const keyTime = `${now - 60};${now + 3600}`
  const signKey = hmacSha1(cred.tmpSecretKey, keyTime)
  const headerMap = {}
  for (const [k, v] of Object.entries(headers)) headerMap[k.toLowerCase()] = v
  const headerKeys = Object.keys(headerMap).sort()
  const paramKeys = Object.keys(params).map(k => k.toLowerCase()).sort()
  const headerStr = headerKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(headerMap[k])}`).join('&')
  const paramStr = paramKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
  const httpString = `${method.toLowerCase()}\n${pathname}\n${paramStr}\n${headerStr}\n`
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`
  return [
    'q-sign-algorithm=sha1', `q-ak=${cred.tmpSecretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    `q-header-list=${headerKeys.join(';')}`, `q-url-param-list=${paramKeys.join(';')}`,
    `q-signature=${hmacSha1(signKey, stringToSign)}`
  ].join('&')
}

function qs(params) {
  const keys = Object.keys(params)
  if (!keys.length) return ''
  return '?' + keys.map(k => params[k] ? `${k}=${encodeURIComponent(params[k])}` : k).join('&')
}

async function cosRequest({ method, params = {}, headers = {}, body }) {
  const host = `${BUCKET}.cos.${REGION}.myqcloud.com`
  const h = { Host: host, 'x-cos-security-token': cred.tmpToken, ...headers }
  const auth = cosSign({ method, pathname: '/', params, headers: h })
  const url = `https://${host}/${qs(params)}`
  const res = await fetch(url, { method, headers: { ...h, Authorization: auth }, body })
  const text = await res.text()
  return { status: res.status, text: text.slice(0, 500) }
}

const WEBSITE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<WebsiteConfiguration>
  <IndexDocument><Suffix>index.html</Suffix></IndexDocument>
  <ErrorDocument><Key>index.html</Key></ErrorDocument>
  <RoutingRules>
    <RoutingRule>
      <Condition><HttpErrorCodeReturnedEquals>404</HttpErrorCodeReturnedEquals></Condition>
      <Redirect><Protocol>https</Protocol><ReplaceKeyWith>index.html</ReplaceKeyWith></Redirect>
    </RoutingRule>
  </RoutingRules>
</WebsiteConfiguration>`

const CORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>*</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`

async function main() {
  console.log('1) 设置桶 ACL public-read ...')
  console.log(JSON.stringify(await cosRequest({ method: 'PUT', params: { acl: '' }, headers: { 'x-cos-acl': 'public-read' } })))

  console.log('\n2) 设置静态网站配置 ...')
  const w = await cosRequest({ method: 'PUT', params: { website: '' }, headers: { 'Content-Type': 'application/xml' }, body: WEBSITE_XML })
  console.log(JSON.stringify(w))

  console.log('\n3) 设置 CORS ...')
  const c = await cosRequest({ method: 'PUT', params: { cors: '' }, headers: { 'Content-Type': 'application/xml' }, body: CORS_XML })
  console.log(JSON.stringify(c))

  console.log('\n4) 查询 bucket 域名可用的直链（不签名）...')
  const host = `${BUCKET}.cos.${REGION}.myqcloud.com`
  for (const u of [`https://${host}/index.html`, `https://${host}/`]) {
    const r = await fetch(u, { redirect: 'manual' })
    console.log(`  ${u} -> HTTP ${r.status} | content-type: ${r.headers.get('content-type')} | disposition: ${r.headers.get('content-disposition')}`)
  }
}

main().catch(e => console.error('FATAL', e))
