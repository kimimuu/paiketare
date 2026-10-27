const { execSync } = require('child_process')
try {
  const ps = execSync('ps aux | grep -E "tcb|tencentcloud" | grep -v grep', { encoding: 'utf8' })
  console.log(ps || '(无相关进程)')
} catch (e) { console.log('无相关进程') }
