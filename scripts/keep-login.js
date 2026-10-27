// 启动 tcb device login 并保持运行，输出用户码到 /tmp/tcb-code.txt
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// 确保子进程能找到 node
const childEnv = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/lib/node_modules/npm/bin' }
const tcbBin = '/usr/local/bin/node'  // 直接用 node 跑 tcb CLI
const tcbScript = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb')

const child = spawn(tcbBin, [tcbScript, 'login', '--flow', 'device'], {
  cwd: path.join(__dirname, '..'),
  env: childEnv,
  shell: true
})

let buffer = ''
child.stdout.on('data', d => {
  const s = d.toString()
  buffer += s
  console.log(s)
  if (buffer.includes('用户码')) {
    const m = buffer.match(/用户码[:：]\s*([A-Z0-9-]+)/)
    if (m) fs.writeFileSync('/tmp/tcb-code.txt', m[1])
    const lm = buffer.match(/https:\/\/tcb\.cloud\.tencent\.com\/dev[^\s]+/)
    if (lm) fs.writeFileSync('/tmp/tcb-url.txt', lm[0])
  }
})
child.stderr.on('data', d => { buffer += d.toString(); process.stderr.write(d.toString()) })

child.on('close', code => {
  console.log(`\n[child] exit code = ${code}`)
  fs.writeFileSync('/tmp/tcb-login-exit.txt', String(code))
  process.exit(code || 0)
})

process.on('SIGTERM', () => { child.kill(); process.exit(0) })
process.on('SIGINT', () => { child.kill(); process.exit(0) })
setTimeout(() => { child.kill(); console.log('[timeout]'); process.exit(1) }, 3600000)
