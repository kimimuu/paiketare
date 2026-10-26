<template>
  <div>
    <van-nav-bar title="我的课表" />
    <div class="nav-row">
      <van-button size="small" @click="shift(-1)">上一周</van-button>
      <van-button size="small" type="primary" plain @click="goToday">今天</van-button>
      <van-button size="small" @click="shift(1)">下一周</van-button>
      <span class="range-text">{{ rangeText }}</span>
    </div>

    <div class="week-scroll">
      <div class="week-grid">
        <div v-for="(d, i) in weekDaysArr" :key="i" class="week-col">
          <div class="week-head" :class="{ today: fmtDate(d) === todayStr }">
            {{ weekdayNames[i] }}<br />{{ d.getMonth() + 1 }}/{{ d.getDate() }}
          </div>
          <div v-for="s in sessionsByDate[fmtDate(d)] || []" :key="s.sessionId" class="course-block" :class="s.status">
            <div class="cb-time">{{ s.startTime }}-{{ s.endTime }}</div>
            <div class="cb-name">{{ s.studentName }}</div>
            <div class="cb-sub">{{ s.campusName }}</div>
            <van-tag size="medium" :type="s.courseType === 'trial' ? 'primary' : 'default'" style="margin-top: 2px;">
              {{ s.courseType === 'trial' ? '体验' : '正式' }}
            </van-tag>
          </div>
        </div>
      </div>
    </div>
    <TeacherTabbar />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast } from 'vant'
import { call } from '../../api'
import TeacherTabbar from '../../components/TeacherTabbar.vue'

const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const currentDate = ref(new Date())
const sessions = ref([])
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
const rangeText = computed(() => {
  const days = weekDaysArr.value
  return `${fmtDate(days[0])} ~ ${fmtDate(days[6])}`
})
const sessionsByDate = computed(() => {
  const m = {}
  sessions.value.forEach(s => { (m[s.date] = m[s.date] || []).push(s) })
  return m
})

function shift(n) {
  const d = new Date(currentDate.value)
  d.setDate(d.getDate() + n * 7)
  currentDate.value = d
}
function goToday() {
  currentDate.value = new Date()
}

async function load() {
  try {
    const days = weekDaysArr.value
    const data = await call('course', { action: 'schedule', startDate: fmtDate(days[0]), endDate: fmtDate(days[6]) })
    sessions.value = (data.list || [])
      .filter(s => s.status !== 'cancelled')
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  } catch (e) {
    showToast(e.message)
  }
}

watch(currentDate, load)
onMounted(load)
</script>

<style scoped>
.nav-row { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.range-text { margin-left: auto; font-size: 13px; color: #646566; }
.week-scroll { overflow-x: auto; padding-bottom: 60px; }
.week-grid { display: flex; gap: 6px; padding: 0 8px 16px; }
.week-col { min-width: 140px; flex: 1; background: #fff; border-radius: 8px; padding: 6px; }
.week-head { text-align: center; font-size: 13px; font-weight: 600; padding: 6px 0; border-bottom: 1px solid #ebedf0; margin-bottom: 6px; }
.week-head.today { color: #1989fa; }
.course-block { background: #e8f3ff; border: 1px solid #1989fa; border-radius: 4px; padding: 4px 6px; margin-bottom: 6px; font-size: 12px; }
.course-block.pending { background: #fffbe8; border: 1px dashed #ed6a0c; }
.course-block.completed { background: #f2f3f5; border-color: #969799; }
.cb-time { color: #646566; }
.cb-name { font-weight: 600; }
.cb-sub { color: #969799; }
</style>
