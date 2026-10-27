// 尝试清除 x-cos-force-download 标记
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
  return ['q-sign-algorithm=sha1', `q-ak=${cred.tmpSecretId}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    `q-header-list=${headerKeys.join(';')}`, `q-url-param-list=${paramKeys.join(';')}`,
    `q-signature=${hmacSha1(signKey, stringToSign)}`].join('&')
}

const KEY = 'index.html'

async function copyWith(headers) {
  const encoded = KEY
  const h = {
    Host: `${BUCKET}.cos.${REGION}.myqcloud.com`,
    'x-cos-security-token': cred.tmpToken,
    'x-cos-copy-source': `${BUCKET}.cos.${REGION}.myqcloud.com/${encoded}`,
    'x-cos-metadata-directive': 'Replaced',
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': 'inline',
    ...headers
  }
  const auth = cosSign({ method: 'PUT', pathname: `/${encoded}`, headers: h })
  const res = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com/${encoded}`, { method: 'PUT', headers: { ...h, Authorization: auth } })
  return { status: res.status, text: (await res.text()).slice(0, 400) }
}

async function probe(label) {
  const r = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com/${KEY}`)
  console.log(`  [${label}] GET -> ${r.status} | disposition=${r.headers.get('content-disposition')} | force-download=${r.headers.get('x-cos-force-download')}`)
}

async function main() {
  console.log('基线:')
  await probe('before')

  console.log('\n尝试 A: x-cos-force-download=false')
  console.log(JSON.stringify(await copyWith({ 'x-cos-force-download': 'false' })))
  await probe('A')

  console.log('\n尝试 B: 无 force-download header')
  console.log(JSON.stringify(await copyWith({})))
  await probe('B')
}

main().catch(e => console.error('FATAL', e))
