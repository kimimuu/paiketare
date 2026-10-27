// 启动 tcb device login，打印 URL + 用户码，保持进程等待
const { spawn } = require('child_process')
const path = require('path')

const tcbBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb')
const proc = spawn(tcbBin, ['login', '--flow', 'device'], {
  cwd: path.join(__dirname, '..'),
  stdio: ['ignore', 'pipe', 'pipe']
})

let out = ''
proc.stdout.on('data', d => { out += d; process.stdout.write(d) })
proc.stderr.on('data', d => { out += d; process.stderr.write(d) })

proc.on('close', code => {
  console.log(`\n=== tcb login exited with code ${code} ===`)
  process.exit(code || 0)
})

// 30 秒后打印一次提示
setTimeout(() => {
  if (out.includes('用户码') || out.includes('authCallbackUrl')) {
    console.log('\n👉 已拿到用户码/链接，请在浏览器授权，授权后本进程会自动完成。')
  }
}, 5000)
