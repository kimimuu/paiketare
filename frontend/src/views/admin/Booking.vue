<template>
  <div class="admin-wide">
    <van-nav-bar title="排课" left-arrow @click-left="$router.back()" />
    <van-steps :active="step" style="margin-top: 12px;">
      <van-step>课程信息</van-step>
      <van-step>选择老师</van-step>
    </van-steps>

    <template v-if="step === 0">
      <van-cell-group inset style="margin-top: 12px;">
        <van-field label="课程类型">
          <template #input>
            <van-radio-group v-model="form.courseType" direction="horizontal">
              <van-radio name="trial">体验课</van-radio>
              <van-radio name="regular">正式课</van-radio>
            </van-radio-group>
          </template>
        </van-field>
        <van-field v-model="studentText" is-link readonly label="学生" placeholder="选择学生" @click="showStudent = true" />
        <van-field v-model="campusText" is-link readonly label="校区" placeholder="选择校区" @click="showCampus = true" />
      </van-cell-group>

      <van-cell-group v-if="form.courseType === 'trial'" inset title="体验课时间">
        <van-field v-model="dateText" is-link readonly label="上课日期" placeholder="选择日期" @click="showDate = true" />
        <van-field v-model="timeText" is-link readonly label="开始时间" placeholder="选择时间" @click="showTime = true" />
      </van-cell-group>

      <van-cell-group v-else inset title="正式课安排">
        <van-field v-model="weekdayText" is-link readonly label="星期" placeholder="选择星期几" @click="showWeekday = true" />
        <van-field v-model="timeText" is-link readonly label="开始时间" placeholder="选择时间" @click="showTime = true" />
        <van-field v-model="durationText" is-link readonly label="单次时长" placeholder="选择时长" @click="showDuration = true" />
        <van-field label="总次数">
          <template #input>
            <van-stepper v-model="form.totalSessions" min="1" max="100" />
          </template>
        </van-field>
      </van-cell-group>

      <div style="margin: 16px;">
        <van-button round block type="primary" :loading="filtering" @click="onFilter">筛选老师</van-button>
      </div>
    </template>

    <template v-else>
      <van-cell-group inset title="候选老师" style="margin-top: 12px;">
        <van-cell v-for="t in teachers" :key="t.teacherId" :title="t.name" :label="teacherCampusText(t)"
          clickable @click="selectedTeacherId = t.teacherId"
          :class="{ 'teacher-selected': selectedTeacherId === t.teacherId }">
          <template #right-icon>
            <van-icon v-if="selectedTeacherId === t.teacherId" name="success" color="#1989fa" />
          </template>
        </van-cell>
        <van-empty v-if="!teachers.length" description="没有符合条件的老师" />
      </van-cell-group>
      <div style="margin: 16px; display: flex; gap: 12px;">
        <van-button round block @click="step = 0">上一步</van-button>
        <van-button round block type="primary" :disabled="!selectedTeacherId" @click="showConfirm = true">确认排课</van-button>
      </div>
    </template>

    <van-popup v-model:show="showStudent" position="bottom">
      <van-picker v-model="studentPickerValue" :columns="studentOptions" @confirm="onStudentConfirm" @cancel="showStudent = false" />
    </van-popup>
    <van-popup v-model:show="showCampus" position="bottom">
      <van-picker v-model="campusPickerValue" :columns="campusOptions" @confirm="onCampusConfirm" @cancel="showCampus = false" />
    </van-popup>
    <van-popup v-model:show="showDate" position="bottom">
      <van-date-picker v-model="dateArr" :min-date="minDate" @confirm="onDateConfirm" @cancel="showDate = false" />
    </van-popup>
    <van-popup v-model:show="showTime" position="bottom">
      <van-time-picker v-model="timeArr" @confirm="onTimeConfirm" @cancel="showTime = false" />
    </van-popup>
    <van-popup v-model:show="showWeekday" position="bottom">
      <van-picker v-model="weekdayPickerValue" :columns="weekdayOptions" @confirm="onWeekdayConfirm" @cancel="showWeekday = false" />
    </van-popup>
    <van-popup v-model:show="showDuration" position="bottom">
      <van-picker v-model="durationPickerValue" :columns="durationOptions" @confirm="onDurationConfirm" @cancel="showDuration = false" />
    </van-popup>

    <van-dialog v-model:show="showConfirm" title="确认排课" show-cancel-button @confirm="onSubmit">
      <div class="summary">
        <p>课程类型：{{ form.courseType === 'trial' ? '体验课' : '正式课' }}</p>
        <p>学生：{{ studentText }}</p>
        <p>校区：{{ campusText }}</p>
        <p v-if="form.courseType === 'trial'">时间：{{ dateText }} {{ timeText }}</p>
        <p v-else>时间：每{{ weekdayText }} {{ timeText }}，每次{{ durationText }}，共 {{ form.totalSessions }} 次</p>
        <p>老师：{{ selectedTeacherName }}</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../../api'

const router = useRouter()

const step = ref(0)
const form = ref({ courseType: 'trial', studentId: '', campusId: '', weekday: null, duration: null, totalSessions: 10 })
const campuses = ref([])
const students = ref([])
const teachers = ref([])
const selectedTeacherId = ref('')
const filtering = ref(false)
const submitting = ref(false)

const showStudent = ref(false)
const showCampus = ref(false)
const showDate = ref(false)
const showTime = ref(false)
const showWeekday = ref(false)
const showDuration = ref(false)
const showConfirm = ref(false)

const studentText = ref('')
const campusText = ref('')
const dateText = ref('')
const timeText = ref('')
const weekdayText = ref('')
const durationText = ref('')

const today = new Date()
const minDate = today
const dateArr = ref([String(today.getFullYear()), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')])
const timeArr = ref(['09', '00'])
const studentPickerValue = ref([])
const campusPickerValue = ref([])
const weekdayPickerValue = ref([])
const durationPickerValue = ref([])

const weekdayOptions = [
  { text: '周日', value: 0 }, { text: '周一', value: 1 }, { text: '周二', value: 2 },
  { text: '周三', value: 3 }, { text: '周四', value: 4 }, { text: '周五', value: 5 },
  { text: '周六', value: 6 }
]
const durationOptions = [
  { text: '1小时', value: 60 }, { text: '1.5小时', value: 90 }, { text: '2小时', value: 120 }
]

const campusMap = computed(() => {
  const m = {}
  campuses.value.forEach(c => { m[c.campusId] = c.name })
  return m
})
const studentOptions = computed(() =>
  students.value.map(s => ({ text: `${s.name}（${campusMap.value[s.campusId] || '未知校区'}）`, value: s.studentId }))
)
const campusOptions = computed(() => campuses.value.map(c => ({ text: c.name, value: c.campusId })))
const selectedTeacherName = computed(() => {
  const t = teachers.value.find(t => t.teacherId === selectedTeacherId.value)
  return t ? t.name : ''
})

function teacherCampusText(t) {
  const names = (t.campuses || []).map(id => campusMap.value[id]).filter(Boolean)
  return names.length ? `可带校区：${names.join('、')}` : `可带 ${(t.campuses || []).length} 个校区`
}

function onStudentConfirm({ selectedValues, selectedOptions }) {
  form.value.studentId = selectedValues[0]
  studentText.value = selectedOptions[0].text
  showStudent.value = false
}
function onCampusConfirm({ selectedValues, selectedOptions }) {
  form.value.campusId = selectedValues[0]
  campusText.value = selectedOptions[0].text
  showCampus.value = false
}
function onDateConfirm({ selectedValues }) {
  dateText.value = selectedValues.join('-')
  showDate.value = false
}
function onTimeConfirm({ selectedValues }) {
  timeText.value = selectedValues.join(':')
  showTime.value = false
}
function onWeekdayConfirm({ selectedValues, selectedOptions }) {
  form.value.weekday = selectedValues[0]
  weekdayText.value = selectedOptions[0].text
  showWeekday.value = false
}
function onDurationConfirm({ selectedValues, selectedOptions }) {
  form.value.duration = selectedValues[0]
  durationText.value = selectedOptions[0].text
  showDuration.value = false
}

async function onFilter() {
  if (!form.value.studentId) return showToast('请选择学生')
  if (!form.value.campusId) return showToast('请选择校区')
  const params = { action: 'filterTeachers', campusId: form.value.campusId, type: form.value.courseType }
  if (form.value.courseType === 'trial') {
    if (!dateText.value) return showToast('请选择上课日期')
    if (!timeText.value) return showToast('请选择开始时间')
    params.date = dateText.value
    params.startTime = timeText.value
  } else {
    if (form.value.weekday === null) return showToast('请选择星期')
    if (!timeText.value) return showToast('请选择开始时间')
    if (!form.value.duration) return showToast('请选择单次时长')
    params.weekday = form.value.weekday
    params.startTime = timeText.value
    params.duration = form.value.duration
    params.totalSessions = form.value.totalSessions
  }
  filtering.value = true
  try {
    const data = await call('schedule', params)
    teachers.value = data.list || []
    selectedTeacherId.value = ''
    step.value = 1
  } catch (e) {
    showToast(e.message)
  } finally {
    filtering.value = false
  }
}

async function onSubmit() {
  submitting.value = true
  try {
    if (form.value.courseType === 'trial') {
      await call('course', {
        action: 'createTrial', studentId: form.value.studentId, teacherId: selectedTeacherId.value,
        campusId: form.value.campusId, date: dateText.value, startTime: timeText.value
      })
      showSuccessToast('排课成功')
    } else {
      const data = await call('course', {
        action: 'createRegular', studentId: form.value.studentId, teacherId: selectedTeacherId.value,
        campusId: form.value.campusId, weekday: form.value.weekday, startTime: timeText.value,
        duration: form.value.duration, totalSessions: form.value.totalSessions
      })
      showSuccessToast(`已生成 ${data.sessionCount} 次课程`)
    }
    router.push('/admin/schedule')
  } catch (e) {
    showToast(e.message)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const [c, s] = await Promise.all([
      call('baseData', { action: 'listCampuses' }),
      call('baseData', { action: 'listStudents' })
    ])
    campuses.value = c.list || []
    students.value = s.list || []
  } catch (e) {
    showToast(e.message)
  }
})
</script>

<style scoped>
.teacher-selected { background: #e8f3ff; }
.summary { padding: 16px 24px; font-size: 14px; line-height: 1.8; }
</style>
