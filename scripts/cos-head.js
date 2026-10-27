// 直接 HEAD COS 源站，判断 attachment 头来自对象元数据还是网关
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const BUCKET = '245d-static-profitable-newt-d2fl5wq6f366cf13-1318599542'
const REGION = 'ap-shanghai'
const cred = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/.cloudbase/auth.json'), 'utf8')).credential
const secretId = cred.tmpSecretId
const secretKey = cred.tmpSecretKey
const token = cred.tmpToken

function sha1(s) { return crypto.createHash('sha1').update(s, 'utf8').digest('hex') }
function hmacSha1(key, s) { return crypto.createHmac('sha1', key).update(s, 'utf8').digest('hex') }

function cosSign({ method, pathname, params = {}, headers = {} }) {
  const now = Math.floor(Date.now() / 1000)
  const keyTime = `${now - 60};${now + 3600}`
  const signKey = hmacSha1(secretKey, keyTime)
  const headerMap = {}
  for (const [k, v] of Object.entries(headers)) headerMap[k.toLowerCase()] = v
  const headerKeys = Object.keys(headerMap).sort()
  const paramKeys = Object.keys(params).map(k => k.toLowerCase()).sort()
  const headerStr = headerKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(headerMap[k])}`).join('&')
  const paramStr = paramKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
  const httpString = `${method.toLowerCase()}\n${pathname}\n${paramStr}\n${headerStr}\n`
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`
  return [
    'q-sign-algorithm=sha1', `q-ak=${secretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    `q-header-list=${headerKeys.join(';')}`, `q-url-param-list=${paramKeys.join(';')}`,
    `q-signature=${hmacSha1(signKey, stringToSign)}`
  ].join('&')
}

async function head(key) {
  const pathname = '/' + key.split('/').map(encodeURIComponent).join('/')
  const headers = { Host: `${BUCKET}.cos.${REGION}.myqcloud.com`, 'x-cos-security-token': token }
  const auth = cosSign({ method: 'HEAD', pathname, headers })
  const res = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com${pathname}`, { method: 'HEAD', headers: { ...headers, Authorization: auth } })
  console.log('--- 源站 HEAD', key, '状态', res.status)
  for (const [k, v] of res.headers.entries()) console.log(`   ${k}: ${v}`)
}

async function main() {
  await head('index.html')
  await head('assets/index-DDwiWU9y.js')
}

main().catch(e => console.error(e))
