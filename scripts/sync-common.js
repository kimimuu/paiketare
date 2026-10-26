// 将 cloudfunctions/common 复制到各云函数目录（CloudBase 函数间无法共享代码）
const fs = require('fs')
const path = require('path')

const COMMON = path.join(__dirname, '../cloudfunctions/common')
const FUNCTIONS = ['auth', 'baseData', 'availability', 'schedule', 'course', 'approval']

for (const fn of FUNCTIONS) {
  const targetDir = path.join(__dirname, '../cloudfunctions', fn, 'common')
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  for (const file of fs.readdirSync(COMMON)) {
    if (file.endsWith('.js')) {
      fs.copyFileSync(path.join(COMMON, file), path.join(targetDir, file))
    }
  }
  console.log(`已同步 common -> ${fn}`)
}
