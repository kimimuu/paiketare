const { execSync } = require('child_process')
const path = require('path')
const REPO = path.join(__dirname, '..')
const GIT = '/usr/bin/git'

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: REPO, encoding: 'utf8' })
    return out.trim()
  } catch (e) {
    console.log('CMD FAIL:', cmd, '\n', e.message)
    return ''
  }
}

// 1. 看状态
const status = run(`${GIT} status --short`)
console.log('=== Git Status ===')
console.log(status.slice(0, 2500))

// 2. Add 所有改动
console.log('\n=== git add ===')
run(`${GIT} add -A`)
console.log('已 add')

// 3. Commit
const msg = `feat(二期 C+D): Excel 导出 + 站内消息

【C 子项目：Excel 导出】
- course 云函数新增 exportSchedule（课表 Excel）和 exportAvailabilities（老师时段+校区 Excel）
- 使用 exceljs 内存生成，base64 dataUrl 返回，前端直接触发下载
- cloudfunctions/course/package.json 加 exceljs ^4.4.0
- 前端 admin/Schedule.vue 加右上角"导出"按钮（带当前筛选条件）
- 前端 admin/Teachers.vue 加右上角"导出时段"按钮

【D 子项目：站内消息】
- 新建 messages 云函数（list/unreadCount/markRead/markAllRead）
- 数据库迁移：messages 表加 type/linkType/linkId/readAt 字段 + 索引
- 主动推送集成点：
  · availability.submitChange → 通知 admin 有新审批
  · approval.approve/reject → 通知老师审批结果
  · course.createTrial/Regular → 通知老师新课待确认
  · course.rescheduleSession → 通知老师调课
  · course.changeTeacher → 通知旧老师移交 + 新老师分配
  · course.endCourse → 通知老师停课
- 前端：Messages.vue（路由 /teacher/messages + /admin/messages）
- TeacherTabbar.vue 加消息 tab + 未读红点
- AdminMenu.vue 加消息入口 + 未读徽章

【配置更新】
- cloudbaserc.json 加 messages 函数
- sync-common.js 加 messages
- schema.sql 更新 messages 表结构
- scripts/migrate-messages.js 迁移脚本
- scripts/e2e-cd.js + e2e-final.js 验证脚本
`

const commitOut = run(`${GIT} commit -m ${JSON.stringify(msg)}`)
console.log('\n=== git commit ===')
console.log(commitOut.slice(0, 1000))

const log = run(`${GIT} log --oneline -5`)
console.log('\n=== 最近 5 条 commit ===')
console.log(log)
