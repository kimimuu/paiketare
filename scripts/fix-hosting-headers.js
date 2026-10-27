// 修复静态托管对象的 Content-Disposition: attachment -> inline
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const BUCKET = '245d-static-profitable-newt-d2fl5wq6f366cf13-1318599542'
const REGION = 'ap-shanghai'
const DRY = !process.argv.includes('--apply')

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

function encKey(key) { return key.split('/').map(encodeURIComponent).join('/') }

function contentType(key) {
  const ext = path.extname(key).toLowerCase()
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  })[ext] || 'application/octet-stream'
}

async function listAll() {
  let marker = ''
  const keys = []
  while (true) {
    const params = { 'max-keys': '1000' }
    if (marker) params.marker = marker
    const headers = { Host: `${BUCKET}.cos.${REGION}.myqcloud.com`, 'x-cos-security-token': token }
    const auth = cosSign({ method: 'GET', pathname: '/', params, headers })
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    const res = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com/?${qs}`, { headers: { ...headers, Authorization: auth } })
    const text = await res.text()
    if (res.status !== 200) throw new Error(`list failed ${res.status}: ${text.slice(0, 300)}`)
    const matches = [...text.matchAll(/<Key>([^<]*)<\/Key>/g)].map(m => m[1])
    keys.push(...matches)
    const truncIdx = text.indexOf('<IsTruncated>true</IsTruncated>')
    if (truncIdx === -1) break
    const nextMarker = (text.match(/<NextMarker>([^<]*)<\/NextMarker>/) || [])[1]
    if (!nextMarker) break
    marker = nextMarker
  }
  return keys
}

async function fixOne(key) {
  const encoded = encKey(key)
  const headers = {
    Host: `${BUCKET}.cos.${REGION}.myqcloud.com`,
    'x-cos-security-token': token,
    'x-cos-copy-source': `${BUCKET}.cos.${REGION}.myqcloud.com/${encoded}`,
    'x-cos-metadata-directive': 'Replaced',
    'Content-Type': contentType(key),
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-cache'
  }
  const auth = cosSign({ method: 'PUT', pathname: `/${encoded}`, headers })
  const res = await fetch(`https://${BUCKET}.cos.${REGION}.myqcloud.com/${encoded}`, { method: 'PUT', headers: { ...headers, Authorization: auth } })
  const text = await res.text()
  return { status: res.status, text: text.slice(0, 200) }
}

async function main() {
  const keys = (await listAll()).filter(k => !k.endsWith('/'))
  console.log(`共 ${keys.length} 个对象，模式: ${DRY ? 'DRY-RUN（仅预览）' : 'APPLY（实际修改）'}`)
  for (const k of keys) {
    if (DRY) {
      console.log(`  [预览] ${k} -> ${contentType(k)} / inline`)
    } else {
      try {
        const r = await fixOne(k)
        console.log(`  ${r.status === 200 ? 'OK ' : 'FAIL'} ${k} ${r.status === 200 ? '' : r.text}`)
      } catch (e) {
        console.log(`  ERR ${k}: ${e.message}`)
      }
    }
  }
}

main().catch(e => console.error('FATAL', e))
