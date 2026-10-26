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
        <van-cell v-for="s in sessions" :key="s.sessionId">
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
          <div v-for="s in sessionsByDate[fmtDate(d)] || []" :key="s.sessionId" class="course-block" :class="s.status">
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

    <van-popup v-model:show="showCampus" position="bottom">
      <van-picker :columns="campusOptions" @confirm="onCampusConfirm" @cancel="showCampus = false" />
    </van-popup>
    <van-popup v-model:show="showTeacher" position="bottom">
      <van-picker :columns="teacherOptions" @confirm="onTeacherConfirm" @cancel="showTeacher = false" />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast } from 'vant'
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

const campusOptions = computed(() => [{ text: '全部', value: '' }, ...campuses.value.map(c => ({ text: c.name, value: c.campusId }))])
const teacherOptions = computed(() => [{ text: '全部', value: '' }, ...teachers.value.map(t => ({ text: t.name, value: t.uid }))])

const todayStr = fmtDate(new Date())

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
  return { pending: '待确认', confirmed: '已确认', completed: '已完成' }[s] || s
}
function statusType(s) {
  return { pending: 'warning', confirmed: 'success', completed: 'default' }[s] || 'default'
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
function goToday() {
  currentDate.value = new Date()
}

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
</style>
