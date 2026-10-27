// 强制部署云函数
const { spawnSync } = require('child_process')
const path = require('path')

const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const FUNCTIONS = ['course', 'availability', 'approval']  // messages 已部署
const tcbBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tcb')

for (const fn of FUNCTIONS) {
  console.log(`\n========== 强制部署 ${fn} ==========`)
  const result = spawnSync('/usr/local/bin/node', [
    tcbBin, 'fn', 'deploy', fn, '--force', '--yes', '-e', ENV
  ], {
    cwd: path.join(__dirname, '..'),
    timeout: 180000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  console.log('STDOUT:', result.stdout ? result.stdout.slice(-400) : '')
  console.log('STDERR:', result.stderr ? result.stderr.slice(-300) : '')
  console.log('exit code:', result.status)
  if (result.error) console.log('ERROR:', result.error.message)
  if (result.status !== 0) {
    console.error(`❌ ${fn} 部署失败，中止`)
    process.exit(1)
  }
}
console.log('\n✅ 所有云函数强制部署完成')
