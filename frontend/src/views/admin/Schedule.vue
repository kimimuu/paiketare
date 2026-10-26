<template>
  <div class="admin-wide">
    <van-nav-bar title="课表" left-arrow @click-left="$router.back()" />
    <van-tabs v-model:active="mode">
      <van-tab title="天" name="day" />
      <van-tab title="周" name="week" />
    </van-tabs>

    <van-cell-group inset style="margin-top: 8px;">
      <van-field v-model="campusFilterText" is-link readonly label="校区" placeholder="全部" @click="showCampus = true" />
      <van-field v-model="teacherFilterText" is-link readonly label="老师" placeholder="全部" @click="showTeacher = true" />
    </van-cell-group>

    <div class="nav-row">
      <van-button size="small" @click="shift(-1)">上一{{ mode === 'day' ? '天' : '周' }}</van-button>
      <van-button size="small" type="primary" plain @click="goToday">今天</van-button>
      <van-button size="small" @click="shift(1)">下一{{ mode === 'day' ? '天' : '周' }}</van-button>
      <span class="range-text">{{ rangeText }}</span>
    </div>

    <div v-if="mode === 'day'">
      <van-empty v-if="!sessions.length" description="当天无课程" />
      <van-cell-group v-else inset>
        <van-cell v-for="s in sessions" :key="s.sessionId" is-link @click="openActions(s)">
          <template #title>{{ s.startTime }}-{{ s.endTime }} {{ s.studentName }}</template>
          <template #label>老师：{{ s.teacherName }} · {{ s.campusName }}</template>
          <template #value>
            <van-tag :type="s.courseType === 'trial' ? 'primary' : 'default'">{{ s.courseType === 'trial' ? '体验' : '正式' }}</van-tag>
            <van-tag :type="statusType(s.status)" style="margin-left: 4px;">{{ statusText(s.status) }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <div v-else class="week-scroll">
      <div class="week-grid">
        <div v-for="(d, i) in weekDaysArr" :key="i" class="week-col">
          <div class="week-head" :class="{ today: fmtDate(d) === todayStr }">
            {{ weekdayNames[i] }}<br />{{ d.getMonth() + 1 }}/{{ d.getDate() }}
          </div>
          <div v-for="s in sessionsByDate[fmtDate(d)] || []" :key="s.sessionId" class="course-block" :class="s.status" @click="openActions(s)">
            <div class="cb-time">{{ s.startTime }}-{{ s.endTime }}</div>
            <div class="cb-name">{{ s.studentName }}</div>
            <div class="cb-sub">{{ s.teacherName }}</div>
            <van-tag size="medium" :type="s.courseType === 'trial' ? 'primary' : 'default'" style="margin-top: 2px;">
              {{ s.courseType === 'trial' ? '体验' : '正式' }}
            </van-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- 筛选 picker -->
    <van-popup v-model:show="showCampus" position="bottom">
      <van-picker :columns="campusOptions" @confirm="onCampusConfirm" @cancel="showCampus = false" />
    </van-popup>
    <van-popup v-model:show="showTeacher" position="bottom">
      <van-picker :columns="teacherOptions" @confirm="onTeacherConfirm" @cancel="showTeacher = false" />
    </van-popup>

    <!-- 操作面板 -->
    <van-action-sheet v-model:show="showActions" title="课程操作" cancel-text="取消">
      <div v-if="selectedSession" class="sess-info">
        <div class="sess-title">{{ selectedSession.startTime }}-{{ selectedSession.endTime }} {{ selectedSession.studentName }}</div>
        <div class="sess-meta">{{ selectedSession.date }} · {{ selectedSession.campusName }} · {{ selectedSession.status }}</div>
      </div>
      <van-button block type="primary" plain class="op-btn" @click="openReschedule">调课（改时间/日期/校区）</van-button>
      <van-button block type="warning" plain class="op-btn" @click="openChangeTeacher">换老师</van-button>
      <van-button block type="danger" plain class="op-btn" @click="onEndCourse">停课（提前结束）</van-button>
    </van-action-sheet>

    <!-- 调课弹窗 -->
    <van-dialog v-model:show="showReschedule" title="调课" width="90%" show-cancel-button @confirm="submitReschedule">
      <div v-if="selectedSession" class="form-box">
        <van-field label="日期" readonly is-link :model-value="rs.newDate || selectedSession.date" @click="pickDate = true" />
        <van-field label="开始时间" readonly is-link :model-value="rs.newStartTime || selectedSession.startTime" @click="pickStartTime = true" />
        <van-field label="结束时间" readonly :model-value="rs.newEndTime || defaultEndTime" />
        <van-field label="校区" readonly is-link :model-value="rs.newCampusId ? campusName(rs.newCampusId) : selectedSession.campusName" @click="pickCampus = true" />
        <div v-if="rs.error" class="form-error">{{ rs.error }}</div>
      </div>
    </van-dialog>
    <van-popup v-model:show="pickDate" position="bottom">
      <van-datetime-picker type="date" :min-date="minDate" :model-value="rs.newDate || selectedSession?.date" @confirm="(v) => { rs.newDate = v; pickDate = false; autoEndTime() }" @cancel="pickDate = false" />
    </van-popup>
    <van-popup v-model:show="pickStartTime" position="bottom">
      <van-datetime-picker type="time" :model-value="rs.newStartTime || selectedSession?.startTime" @confirm="(v) => { rs.newStartTime = v; pickStartTime = false; autoEndTime() }" @cancel="pickStartTime = false" />
    </van-popup>
    <van-popup v-model:show="pickCampus" position="bottom">
      <van-picker :columns="campusOptions.filter(x => x.value)" @confirm="(v) => { rs.newCampusId = v.selectedValues[0]; pickCampus = false }" @cancel="pickCampus = false" />
    </van-popup>

    <!-- 换老师弹窗 -->
    <van-dialog v-model:show="showChangeTeacher" title="换老师" width="90%" show-cancel-button @confirm="submitChangeTeacher">
      <div v-if="selectedSession" class="form-box">
        <div class="ct-hint">将替换未来的 {{ changeTeacherFutureHint }} 节课</div>
        <van-field v-model="ct.teacherId" readonly is-link label="新老师" :placeholder="ct.loading ? '加载中...' : '请选择'" @click="openTeacherPicker" />
        <div v-if="ct.error" class="form-error">{{ ct.error }}</div>
      </div>
    </van-dialog>
    <van-popup v-model:show="ct.showPicker" position="bottom">
      <van-picker :columns="ct.candidates.map(c => ({ text: c.name, value: c.uid }))" @confirm="(v) => { ct.teacherId = v.selectedValues[0]; ct.showPicker = false }" @cancel="ct.showPicker = false" />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { call } from '../../api'

const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const mode = ref('day')
const currentDate = ref(new Date())
const sessions = ref([])
const campuses = ref([])
const teachers = ref([])
const campusFilter = ref('')
const teacherFilter = ref('')
const campusFilterText = ref('全部')
const teacherFilterText = ref('全部')
const showCampus = ref(false)
const showTeacher = ref(false)

// 操作面板
const showActions = ref(false)
const selectedSession = ref(null)
const showReschedule = ref(false)
const showChangeTeacher = ref(false)

const campusOptions = computed(() => [{ text: '全部', value: '' }, ...campuses.value.map(c => ({ text: c.name, value: c.campusId }))])
const teacherOptions = computed(() => [{ text: '全部', value: '' }, ...teachers.value.map(t => ({ text: t.name, value: t.uid }))])
const todayStr = fmtDate(new Date())
const minDate = new Date()

function campusName(id) { return campuses.value.find(c => c.campusId === id)?.name || id }

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function weekStart(d) {
  const x = new Date(d)
  x.setDate(x.getDate() - (x.getDay() + 6) % 7)
  return x
}
const weekDaysArr = computed(() => {
  const start = weekStart(currentDate.value)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    return x
  })
})
const range = computed(() => {
  if (mode.value === 'day') return { start: currentDate.value, end: currentDate.value }
  const days = weekDaysArr.value
  return { start: days[0], end: days[6] }
})
const rangeText = computed(() => {
  const { start, end } = range.value
  return mode.value === 'day' ? fmtDate(start) : `${fmtDate(start)} ~ ${fmtDate(end)}`
})
const sessionsByDate = computed(() => {
  const m = {}
  sessions.value.forEach(s => { (m[s.date] = m[s.date] || []).push(s) })
  return m
})

function statusText(s) {
  return { pending: '待确认', confirmed: '已确认', completed: '已完成', cancelled: '已取消' }[s] || s
}
function statusType(s) {
  return { pending: 'warning', confirmed: 'success', completed: 'default', cancelled: 'danger' }[s] || 'default'
}

function onCampusConfirm({ selectedValues, selectedOptions }) {
  campusFilter.value = selectedValues[0]
  campusFilterText.value = selectedOptions[0].text
  showCampus.value = false
}
function onTeacherConfirm({ selectedValues, selectedOptions }) {
  teacherFilter.value = selectedValues[0]
  teacherFilterText.value = selectedOptions[0].text
  showTeacher.value = false
}
function shift(n) {
  const d = new Date(currentDate.value)
  d.setDate(d.getDate() + (mode.value === 'day' ? n : n * 7))
  currentDate.value = d
}
function goToday() { currentDate.value = new Date() }

async function load() {
  try {
    const params = { action: 'schedule', startDate: fmtDate(range.value.start), endDate: fmtDate(range.value.end) }
    if (campusFilter.value) params.campusId = campusFilter.value
    if (teacherFilter.value) params.teacherId = teacherFilter.value
    const data = await call('course', params)
    sessions.value = (data.list || []).slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  } catch (e) {
    showToast(e.message)
  }
}

// ---- 操作 ----
function openActions(s) {
  selectedSession.value = s
  showActions.value = true
}

// 调课
const pickDate = ref(false)
const pickStartTime = ref(false)
const pickCampus = ref(false)
const rs = ref({ newDate: '', newStartTime: '', newEndTime: '', newCampusId: '', error: '' })

const defaultEndTime = computed(() => {
  if (!selectedSession.value) return ''
  return selectedSession.value.endTime
})

function autoEndTime() {
  if (rs.value.newStartTime && selectedSession.value) {
    const [h, m] = rs.value.newStartTime.split(':').map(Number)
    const startMin = h * 60 + m
    const dur = toMin(selectedSession.value.endTime) - toMin(selectedSession.value.startTime)
    const endMin = startMin + dur
    if (endMin <= 1440) {
      const eh = Math.floor(endMin / 60)
      const em = endMin % 60
      rs.value.newEndTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
    }
  }
}
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

function openReschedule() {
  if (!selectedSession.value) return
  rs.value = { newDate: '', newStartTime: '', newEndTime: '', newCampusId: '', error: '' }
  showActions.value = false
  showReschedule.value = true
}

async function submitReschedule() {
  if (!selectedSession.value) return
  rs.value.error = ''
  const data = { sessionId: selectedSession.value.sessionId }
  if (rs.value.newDate && rs.value.newDate !== selectedSession.value.date) data.newDate = rs.value.newDate
  if (rs.value.newStartTime && rs.value.newStartTime !== selectedSession.value.startTime) data.newStartTime = rs.value.newStartTime
  if (rs.value.newEndTime && rs.value.newEndTime !== selectedSession.value.endTime) data.newEndTime = rs.value.newEndTime
  if (rs.value.newCampusId && rs.value.newCampusId !== selectedSession.value.campusId) data.newCampusId = rs.value.newCampusId
  if (!data.newDate && !data.newStartTime && !data.newEndTime && !data.newCampusId) {
    showToast('未做任何修改')
    showReschedule.value = false
    return
  }
  try {
    await call('course', { action: 'rescheduleSession', ...data })
    showToast('调课成功')
    showReschedule.value = false
    load()
  } catch (e) {
    rs.value.error = e.message
  }
}

// 换老师
const ct = ref({ teacherId: '', loading: false, candidates: [], showPicker: false, error: '' })

function countFutureSessions() {
  const sess = selectedSession.value
  if (!sess) return 0
  const today = fmtDate(new Date())
  return sessions.value.filter(s =>
    s.courseId === sess.courseId && s.date >= today && s.status !== 'cancelled'
  ).length
}
const changeTeacherFutureHint = computed(() => `${countFutureSessions()} 节`)

async function openChangeTeacher() {
  if (!selectedSession.value) return
  ct.value = { teacherId: '', loading: true, candidates: [], showPicker: false, error: '' }
  showActions.value = false
  showChangeTeacher.value = true
  try {
    const s = selectedSession.value
    const dur = toMin(s.endTime) - toMin(s.startTime)
    const data = await call('course', {
      action: 'findCandidatesForReschedule',
      campusId: s.campusId,
      date: s.date,
      startTime: s.startTime,
      duration: dur,
      excludeTeacherId: s.teacherId
    })
    ct.value.candidates = data.list || []
    ct.value.loading = false
  } catch (e) {
    ct.value.error = e.message
    ct.value.loading = false
  }
}

function openTeacherPicker() {
  if (ct.value.loading) return
  if (!ct.value.candidates.length) {
    showToast('暂无可用老师')
    return
  }
  ct.value.showPicker = true
}

async function submitChangeTeacher() {
  if (!selectedSession.value || !ct.value.teacherId) {
    showToast('请选择新老师')
    return
  }
  ct.value.error = ''
  try {
    await call('course', {
      action: 'changeTeacher',
      courseId: selectedSession.value.courseId,
      newTeacherId: ct.value.teacherId
    })
    showToast('换老师成功')
    showChangeTeacher.value = false
    load()
  } catch (e) {
    ct.value.error = e.message
  }
}

// 停课
async function onEndCourse() {
  if (!selectedSession.value) return
  const sess = selectedSession.value
  showActions.value = false
  try {
    await showConfirmDialog({
      title: '确认停课',
      message: `${sess.date} ${sess.startTime}-${sess.endTime} 所属课程的所有未上节课将被取消，此操作不可撤销。确定？`,
      confirmButtonText: '确定停课',
      confirmButtonColor: '#ee0a24'
    })
    await call('course', { action: 'endCourse', courseId: sess.courseId })
    showToast('停课成功')
    load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'overlay') showToast(e.message || '停课失败')
  }
}

watch([mode, currentDate, campusFilter, teacherFilter], load)

onMounted(async () => {
  try {
    const [c, t] = await Promise.all([
      call('baseData', { action: 'listCampuses' }),
      call('auth', { action: 'listTeachers' })
    ])
    campuses.value = c.list || []
    teachers.value = (t.list || []).filter(x => x.status === 'active')
  } catch (e) {
    showToast(e.message)
  }
  load()
})
</script>

<style scoped>
.nav-row { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.range-text { margin-left: auto; font-size: 13px; color: #646566; }
.week-scroll { overflow-x: auto; }
.week-grid { display: flex; gap: 6px; padding: 0 8px 16px; }
.week-col { min-width: 140px; flex: 1; background: #fff; border-radius: 8px; padding: 6px; }
.week-head { text-align: center; font-size: 13px; font-weight: 600; padding: 6px 0; border-bottom: 1px solid #ebedf0; margin-bottom: 6px; }
.week-head.today { color: #1989fa; }
.course-block { background: #e8f3ff; border-left: 3px solid #1989fa; border-radius: 4px; padding: 4px 6px; margin-bottom: 6px; font-size: 12px; }
.course-block.pending { background: #fffbe8; border-left-color: #ed6a0c; }
.course-block.completed { background: #f2f3f5; border-left-color: #969799; }
.cb-time { color: #646566; }
.cb-name { font-weight: 600; }
.cb-sub { color: #969799; }
.sess-info { padding: 12px 16px; background: #f7f8fa; margin-bottom: 12px; }
.sess-title { font-weight: 600; font-size: 15px; }
.sess-meta { font-size: 12px; color: #969799; margin-top: 4px; }
.op-btn { margin-top: 8px; }
.form-box { padding: 8px 0; }
.form-error { color: #ee0a24; font-size: 13px; padding: 8px 16px; }
.ct-hint { font-size: 12px; color: #646566; padding: 0 16px 8px; }
</style>
