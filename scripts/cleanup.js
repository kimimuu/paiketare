const { execSync } = require('child_process')
const path = require('path')
const REPO = path.join(__dirname, '..')
const GIT = '/usr/bin/git'

function run(cmd) {
  try { return execSync(cmd, { cwd: REPO, encoding: 'utf8' }).trim() }
  catch (e) { console.log('ERR', cmd, e.message); return '' }
}

// 从 git 索引移除但保留本地文件
const files = [
  'scripts/diag-p1.js', 'scripts/diag2.js', 'scripts/diag3.js',
  'scripts/ckauth.js', 'scripts/ckauth2.js', 'scripts/check-proc.js',
  'scripts/run-login.js', 'scripts/keep-login.js',
  'scripts/configure-cos-direct.js', 'scripts/cos-buckets.js', 'scripts/cos-head.js', 'scripts/cos-list.js',
  'scripts/fix-hosting-config.js', 'scripts/fix-hosting-headers.js',
  'scripts/test-force-download.js', 'scripts/git-commit.js', 'scripts/deploy-functions.js',
  'scripts/e2e-cd.js', 'scripts/e2e-cd-precise.js', 'scripts/e2e-final.js',
  'scripts/migrate-messages.js',
  'cloudfunctions/*/common/messages.js'
]

// 先 commit .gitignore 更新
run(`${GIT} add .gitignore`)

// 用 git rm --cached 移除已被 git 跟踪的
for (const f of files) {
  run(`${GIT} rm --cached --ignore-unmatch ${f}`)
}

console.log('=== 清理后状态 ===')
const s = run(`${GIT} status --short`)
console.log(s.slice(0, 2000))

run(`${GIT} commit -m ${JSON.stringify('chore: 清理临时脚本 + 更新 .gitignore')}`)
console.log('\n=== 最近 commit ===')
console.log(run(`${GIT} log --oneline -3`))
