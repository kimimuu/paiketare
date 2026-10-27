// 诊断：用 COS API 列静态托管桶内对象
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const ENV_ID = 'profitable-newt-d2fl5wq6f366cf13'
const APPID = '1318599542'
const REGION = 'ap-shanghai'
const BUCKET = `${ENV_ID}-${APPID}` // 假定桶名

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

  // header 原始名 -> 小写名 映射
  const headerMap = {}
  for (const [k, v] of Object.entries(headers)) headerMap[k.toLowerCase()] = v
  const headerKeys = Object.keys(headerMap).sort()
  const paramKeys = Object.keys(params).map(k => k.toLowerCase()).sort()

  const headerStr = headerKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(headerMap[k])}`).join('&')
  const paramStr = paramKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')

  const httpString = `${method.toLowerCase()}\n${pathname}\n${paramStr}\n${headerStr}\n`
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`
  const signature = hmacSha1(signKey, stringToSign)

  const auth = [
    'q-sign-algorithm=sha1',
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerKeys.join(';')}`,
    `q-url-param-list=${paramKeys.join(';')}`,
    `q-signature=${signature}`
  ].join('&')

  return auth
}

function authHeaders(extra) {
  return { ...extra, 'x-cos-security-token': token }
}

async function listObjects(prefix = '') {
  const pathname = '/'
  const headers = authHeaders({ Host: `${BUCKET}.cos.${REGION}.myqcloud.com` })
  const auth = cosSign({ method: 'GET', pathname, params: { prefix, 'max-keys': '100' }, headers })
  const qs = `prefix=${encodeURIComponent(prefix)}&max-keys=100`
  const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/?${qs}`
  const res = await fetch(url, { headers: { ...headers, Authorization: auth } })
  const text = await res.text()
  return { status: res.status, text }
}

async function main() {
  console.log('桶:', BUCKET, '| region:', REGION)
  const r = await listObjects('')
  console.log('HTTP', r.status)
  console.log(r.text.slice(0, 3000))
}

main().catch(e => console.error('ERR', e))
