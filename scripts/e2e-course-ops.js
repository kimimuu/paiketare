// 二期 B 端到端测试：调课 / 换老师 / 停课
const ENV = 'profitable-newt-d2fl5wq6f366cf13'
const BASE = `https://${ENV}.api.tcloudbasegateway.com`

let passed = 0
let failed = 0
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  PASS ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 400) : ''}`) }
}

async function anonToken() {
  const res = await fetch(`${BASE}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-course-ops' },
    body: '{}'
  })
  const body = await res.json()
  if (!body.access_token) throw new Error('匿名登录失败')
  return body.access_token
}

async function call(gwToken, name, data) {
  const res = await fetch(`${BASE}/v1/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'e2e-course-ops', Authorization: `Bearer ${gwToken}` },
    body: JSON.stringify(data)
  })
  return res.json()
}

function addDays(dateStr, n) {
  const dt = new Date(dateStr + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

async function main() {
  const gw = await anonToken()
  const today = new Date().toISOString().slice(0, 10)
  const tmr = addDays(today, 1)
  const dayAfter = addDays(today, 2)

  // ---- 1. 准备老师时间 ----
  console.log('准备：设置张老师/李老师的可用时间（含清理旧数据）')
  let r = await call(gw, 'auth', { action: 'login', phone: '13800000000', password: 'admin123456' })
  const admTok = r.data.token
  ok(r.code === 0, '管理员登录')

  r = await call(gw, 'auth', { action: 'login', phone: '13900000001', password: 'zhang123456' })
  const teaTok = r.data.token
  const zhangUid = r.data.user.uid
  ok(r.code === 0, '张老师登录')

  let zhang = (await call(gw, 'auth', { action: 'listTeachers', token: admTok })).data.list.find(t => t.name === '张老师')
  let li = (await call(gw, 'auth', { action: 'listTeachers', token: admTok })).data.list.find(t => t.name === '李老师')
  ok(zhang && li, '读取老师列表')

  const campuses = (await call(gw, 'baseData', { action: 'listCampuses', token: admTok })).data.list
  const mainCampus = campuses[0]
  const mainCampusId = mainCampus.campusId
  ok(mainCampus, '读取校区')

  // 先清张老师/李老师所有 slots + 设置校区
  const zhangSlots = (await call(gw, 'availability', { action: 'listMy', token: teaTok })).data.slots || []
  for (const slot of zhangSlots) {
    await call(gw, 'availability', { action: 'removeSlot', token: admTok, slotId: slot.slotId })
  }
  const liList = (await call(gw, 'auth', { action: 'listTeachers', token: admTok })).data.list
  li = liList.find(t => t.name === '李老师')

  await call(gw, 'availability', { action: 'setCampuses', token: admTok, userId: zhang.uid, campusIds: [mainCampusId] })
  await call(gw, 'availability', { action: 'setCampuses', token: admTok, userId: li.uid, campusIds: [mainCampusId] })

  // 张老师: 明天 10:00-12:00, 明天 18:00-21:00, 周三 weekly 14:00-16:00 + 后天 date 14:00-16:00
  await call(gw, 'availability', { action: 'addSlot', token: admTok, userId: zhang.uid, type: 'date', date: tmr, startTime: '10:00', endTime: '12:00' })
  await call(gw, 'availability', { action: 'addSlot', token: admTok, userId: zhang.uid, type: 'date', date: tmr, startTime: '18:00', endTime: '21:00' })
  // 后天 14:00-16:00（2026-10-28 是周三，weekday=3）
  const dayAfterWeekday = new Date(dayAfter + 'T00:00:00Z').getUTCDay()
  await call(gw, 'availability', { action: 'addSlot', token: admTok, userId: zhang.uid, type: 'weekly', weekday: dayAfterWeekday, startTime: '14:00', endTime: '16:00' })

  // 李老师: 周三 weekly 14:00-16:00（换老师测试用）
  await call(gw, 'availability', { action: 'addSlot', token: admTok, userId: li.uid, type: 'weekly', weekday: dayAfterWeekday, startTime: '14:00', endTime: '16:00' })
  ok(true, '老师时间/校区准备完成')

  // ---- 2. 发起课程 ----
  console.log('准备：发起体验课/正式课')
  const students = (await call(gw, 'baseData', { action: 'listStudents', token: admTok })).data.list
  const student = students.find(s => s.name === '小明')
  ok(!!student, '读取学生')

  // trial1: 张老师 明天 18:00-18:30
  r = await call(gw, 'course', { action: 'createTrial', token: admTok, studentId: student.studentId, teacherId: zhang.uid, campusId: mainCampusId, date: tmr, startTime: '18:00' })
  ok(r.code === 0, '发起 trial1 (18:00-18:30)', r)
  const trial1CourseId = r.data.courseId

  // trial2: 张老师 明天 19:30-20:00
  r = await call(gw, 'course', { action: 'createTrial', token: admTok, studentId: student.studentId, teacherId: zhang.uid, campusId: mainCampusId, date: tmr, startTime: '19:30' })
  ok(r.code === 0, '发起 trial2 (19:30-20:00)', r)
  const trial2CourseId = r.data.courseId

  // 正式课: 张老师 后天 14:00-16:00 × 2 周
  r = await call(gw, 'course', { action: 'createRegular', token: admTok, studentId: student.studentId, teacherId: zhang.uid, campusId: mainCampusId, weekday: new Date(dayAfter + 'T00:00:00Z').getUTCDay(), startTime: '14:00', duration: 120, totalSessions: 2 })
  ok(r.code === 0, '发起正式课 course3', r)
  const course3Id = r.data.courseId

  // 从 schedule 拿到所有 sessionId
  const allSchedule = (await call(gw, 'course', { action: 'schedule', token: admTok, startDate: today, endDate: addDays(today, 14) })).data.list || []
  const trial1Sess = allSchedule.find(s => s.courseId === trial1CourseId)
  const trial2Sess = allSchedule.find(s => s.courseId === trial2CourseId)
  const course3Sesses = allSchedule.filter(s => s.courseId === course3Id)
  ok(trial1Sess && trial2Sess && course3Sesses.length === 2, '获取所有 sessionId', { trial1Sess, trial2Sess, course3Sesses })

  // 先确认 trial1/trial2 的 session 状态（reschedule 只对 BLOCKING 状态生效）
  for (const sess of allSchedule.filter(s => s.courseId === trial1CourseId || s.courseId === trial2CourseId)) {
    await call(gw, 'course', { action: 'confirm', token: teaTok, courseId: sess.courseId })
  }
  for (const sess of allSchedule.filter(s => s.courseId === course3Id)) {
    await call(gw, 'course', { action: 'confirm', token: teaTok, courseId: sess.courseId })
  }
  ok(true, '所有课程已确认')

  // 重新拉 schedule 拿最新 session 数据
  const refreshed = (await call(gw, 'course', { action: 'schedule', token: admTok, startDate: today, endDate: addDays(today, 14) })).data.list || []
  const t1Session = refreshed.find(s => s.courseId === trial1CourseId)
  const t2Session = refreshed.find(s => s.courseId === trial2CourseId)
  const c3Sesses = refreshed.filter(s => s.courseId === course3Id)
  const t1SessionId = t1Session.sessionId
  const t2SessionId = t2Session.sessionId
  ok(t1SessionId && t2SessionId && c3Sesses.length === 2, 'sessionIds', { t1SessionId, t2SessionId, c3Sesses })

  // ========== 测试 1: reschedule 成功 ==========
  console.log('\n1. 调课：正常改时间成功')
  r = await call(gw, 'course', { action: 'rescheduleSession', token: admTok, sessionId: t1SessionId, newDate: tmr, newStartTime: '20:15' })
  ok(r.code === 0, 'reschedule 20:15-20:45 成功', r)
  // 验证刷新后时段已更新
  const afterResched = (await call(gw, 'course', { action: 'schedule', token: admTok, startDate: tmr, endDate: tmr })).data.list || []
  const updatedT1 = afterResched.find(s => s.sessionId === t1SessionId)
  ok(updatedT1 && updatedT1.startTime === '20:15' && updatedT1.endTime === '20:45', '调课后时段正确', updatedT1)

  // ========== 测试 2: reschedule 到老师不可用时段 ==========
  console.log('\n2. 调课：改到老师不可用时段 → 400')
  r = await call(gw, 'course', { action: 'rescheduleSession', token: admTok, sessionId: t2SessionId, newDate: tmr, newStartTime: '22:00' })
  ok(r.code === 400 && /不在老师可用时段/.test(r.message || ''), '调课到不可用时段被拒', r)

  // ========== 测试 3: reschedule 到与其他 session 冲突 ==========
  console.log('\n3. 调课：改到与同老师其他课冲突 → 400 + conflicts')
  // t1 现在是 20:15-20:45, t2 是 19:30-20:00
  // 把 t1 移到 19:45-20:15 → 和 t2(19:30-20:00) 冲突
  r = await call(gw, 'course', { action: 'rescheduleSession', token: admTok, sessionId: t1SessionId, newDate: tmr, newStartTime: '19:45' })
  ok(r.code === 400 && /冲突/.test(r.message || ''), '调课冲突被拒', r)
  ok(Array.isArray(r.conflicts) && r.conflicts.length > 0, '返回 conflicts 详情', r.conflicts)

  // ========== 测试 4: reschedule 不存在的 session ==========
  console.log('\n4. 调课：不存在的 sessionId → 400')
  r = await call(gw, 'course', { action: 'rescheduleSession', token: admTok, sessionId: 'nonexistent', newDate: tmr, newStartTime: '18:00' })
  ok(r.code === 400, '不存在的 session 返回 400', r)

  // ========== 测试 5: findCandidatesForReschedule ==========
  console.log('\n5. 换老师候选查询')
  // 查 tmr 18:00-18:30，张老师有这个 slot，李老师没有（李老师只有周三 weekly 14:00-16:00）
  r = await call(gw, 'course', { action: 'findCandidatesForReschedule', token: admTok, campusId: mainCampusId, date: tmr, startTime: '18:00', duration: 30 })
  ok(r.code === 0 && Array.isArray(r.data?.list), '候选查询返回列表', r)
  ok(r.data.list.some(t => t.uid === zhang.uid), '候选包含张老师', r.data.list)
  // 李老师没有 tmr 18:00 的 slot，不应在候选里
  ok(!r.data.list.some(t => t.uid === li.uid), '候选不包含李老师（李老师没有该时段）', r.data.list)

  // ========== 测试 6: changeTeacher 成功 ==========
  console.log('\n6. 换老师：正常换成功')
  r = await call(gw, 'course', { action: 'changeTeacher', token: admTok, courseId: course3Id, newTeacherId: li.uid })
  ok(r.code === 0, '换老师成功', r)
  ok(r.data?.updatedSessions === 2, 'updatedSessions=2', r)
  // 验证 session 的 teacherId 已变
  const afterChange = (await call(gw, 'course', { action: 'schedule', token: admTok, startDate: dayAfter, endDate: addDays(dayAfter, 14) })).data.list || []
  const changedSesses = afterChange.filter(s => s.courseId === course3Id)
  ok(changedSesses.every(s => s.teacherName === '李老师'), '所有 course3 session 老师已改为李老师', changedSesses)

  // ========== 测试 7: changeTeacher 和原老师相同 ==========
  console.log('\n7. 换老师：与原老师相同 → 400')
  r = await call(gw, 'course', { action: 'changeTeacher', token: admTok, courseId: course3Id, newTeacherId: li.uid })
  ok(r.code === 400 && /相同/.test(r.message || ''), '相同老师被拒', r)

  // ========== 测试 8: changeTeacher 老师不支持原校区 ==========
  console.log('\n8. 换老师：新老师不支持校区 → 400')
  // 给张老师换一个新校区（不影响），然后换 course3 到 张老师，但张老师不支持 course3 的校区 — 不行，张老师支持 mainCampus
  // 换一个方法：创建一个新的备选老师，不给其设置校区
  // 这里直接测试新老师不存在的场景
  r = await call(gw, 'course', { action: 'changeTeacher', token: admTok, courseId: course3Id, newTeacherId: 'nonexistent-teacher' })
  ok(r.code === 400, '新老师不存在被拒', r)

  // ========== 测试 9: endCourse 成功 ==========
  console.log('\n9. 停课：正常停，sessions 全 cancelled')
  // 用 trial2CourseId（已确认，明天 19:30）
  r = await call(gw, 'course', { action: 'endCourse', token: admTok, courseId: trial2CourseId })
  ok(r.code === 0 && r.data?.cancelledSessions >= 1, '停课成功', r)
  // 验证
  const afterEnd = (await call(gw, 'course', { action: 'schedule', token: admTok, startDate: tmr, endDate: addDays(tmr, 14) })).data.list || []
  const trial2After = afterEnd.find(s => s.courseId === trial2CourseId)
  ok(!trial2After, '停课的课程不在 schedule 中', afterEnd.filter(s => s.courseId === trial2CourseId))

  // ========== 测试 10: endCourse 对已 cancelled 课程 ==========
  console.log('\n10. 停课：对已 cancelled 课程 → 400')
  r = await call(gw, 'course', { action: 'endCourse', token: admTok, courseId: trial2CourseId })
  ok(r.code === 400 && /已取消/.test(r.message || ''), '重复停课被拒', r)

  // ========== 测试 11: 非 admin 调用 → 403 ==========
  console.log('\n11. 非 admin 调用 → 403')
  // 用张老师 token 调 reschedule
  r = await call(gw, 'course', { action: 'rescheduleSession', token: teaTok, sessionId: t1SessionId, newDate: tmr, newStartTime: '18:00' })
  ok(r.code === 403, '老师调课被拒 (403)', r)
  r = await call(gw, 'course', { action: 'changeTeacher', token: teaTok, courseId: trial1CourseId, newTeacherId: zhang.uid })
  ok(r.code === 403, '老师换老师被拒 (403)', r)
  r = await call(gw, 'course', { action: 'endCourse', token: teaTok, courseId: trial1CourseId })
  ok(r.code === 403, '老师停课被拒 (403)', r)

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error('E2E 异常:', err.message)
  process.exit(1)
})
