<template>
  <div class="availability-page">
    <van-nav-bar title="我的时间" />
    <van-tabs v-model:active="tab">
      <van-tab title="每周规律" />
      <van-tab title="临时日期" />
    </van-tabs>

    <div class="slot-list">
      <van-swipe-cell v-for="s in currentSlots" :key="s.slotId">
        <van-cell :title="formatSlot(s)" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" @click="onRemove(s)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!currentSlots.length" :description="tab === 0 ? '暂无每周规律时段' : '暂无临时日期时段'" />
    </div>

    <div class="add-bar">
      <van-button block type="primary" icon="plus" @click="openAdd">添加时段</van-button>
    </div>

    <!-- 添加表单 -->
    <van-popup v-model:show="showAdd" position="bottom" round>
      <div class="add-form">
        <div class="add-title">添加{{ tab === 0 ? '每周规律' : '临时日期' }}时段</div>
        <van-field
          v-if="tab === 0"
          v-model="weekdayText"
          is-link readonly
          label="星期"
          placeholder="选择星期几"
          @click="showWeekday = true"
        />
        <van-field
          v-else
          v-model="form.date"
          is-link readonly
          label="日期"
          placeholder="选择日期"
          @click="showDate = true"
        />
        <van-field
          v-model="form.startTime"
          is-link readonly
          label="开始时间"
          placeholder="选择开始时间"
          @click="openTime('start')"
        />
        <van-field
          v-model="form.endTime"
          is-link readonly
          label="结束时间"
          placeholder="选择结束时间"
          @click="openTime('end')"
        />
        <div style="margin: 16px;">
          <van-button block type="primary" :loading="adding" @click="onAdd">确定添加</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 星期选择 -->
    <van-popup v-model:show="showWeekday" position="bottom" round>
      <van-picker
        :columns="weekdayColumns"
        @confirm="onWeekdayConfirm"
        @cancel="showWeekday = false"
      />
    </van-popup>

    <!-- 日期选择 -->
    <van-popup v-model:show="showDate" position="bottom" round>
      <van-date-picker
        v-model="dateValue"
        title="选择日期"
        :min-date="minDate"
        @confirm="onDateConfirm"
        @cancel="showDate = false"
      />
    </van-popup>

    <!-- 时间选择 -->
    <van-popup v-model:show="showTime" position="bottom" round>
      <van-time-picker
        v-model="timeValue"
        title="选择时间"
        @confirm="onTimeConfirm"
        @cancel="showTime = false"
      />
    </van-popup>

    <TeacherTabbar />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../../api'
import TeacherTabbar from '../../components/TeacherTabbar.vue'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const tab = ref(0)
const slots = ref([])
const showAdd = ref(false)
const adding = ref(false)
const form = ref({ weekday: null, date: '', startTime: '', endTime: '' })

const showWeekday = ref(false)
const weekdayColumns = WEEKDAYS.map((text, value) => ({ text, value }))
const weekdayText = computed(() => (form.value.weekday === null ? '' : WEEKDAYS[form.value.weekday]))

const showDate = ref(false)
const dateValue = ref([])
const minDate = new Date()

const showTime = ref(false)
const timeValue = ref(['18', '00'])
const timeTarget = ref('start')

const currentSlots = computed(() => {
  const type = tab.value === 0 ? 'weekly' : 'date'
  const list = slots.value.filter(s => s.type === type)
  if (type === 'weekly') {
    return list.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
  }
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
})

function formatSlot(s) {
  const label = s.type === 'weekly' ? WEEKDAYS[s.weekday] : s.date
  return `${label} ${s.startTime}-${s.endTime}`
}

async function load() {
  try {
    const data = await call('availability', { action: 'listMy' })
    slots.value = data.slots || []
  } catch (e) {
    showToast(e.message)
  }
}

onMounted(load)

function openAdd() {
  form.value = { weekday: null, date: '', startTime: '', endTime: '' }
  showAdd.value = true
}

function onWeekdayConfirm({ selectedOptions }) {
  form.value.weekday = selectedOptions[0].value
  showWeekday.value = false
}

function onDateConfirm({ selectedValues }) {
  form.value.date = selectedValues.join('-')
  showDate.value = false
}

function openTime(target) {
  timeTarget.value = target
  const cur = target === 'start' ? form.value.startTime : form.value.endTime
  timeValue.value = cur ? cur.split(':') : ['18', '00']
  showTime.value = true
}

function onTimeConfirm({ selectedValues }) {
  const t = selectedValues.join(':')
  if (timeTarget.value === 'start') form.value.startTime = t
  else form.value.endTime = t
  showTime.value = false
}

async function onAdd() {
  const f = form.value
  if (tab.value === 0 && f.weekday === null) return showToast('请选择星期几')
  if (tab.value === 1 && !f.date) return showToast('请选择日期')
  if (!f.startTime || !f.endTime) return showToast('请选择起止时间')
  adding.value = true
  try {
    const payload = tab.value === 0
      ? { action: 'addSlot', type: 'weekly', weekday: f.weekday, startTime: f.startTime, endTime: f.endTime }
      : { action: 'addSlot', type: 'date', date: f.date, startTime: f.startTime, endTime: f.endTime }
    await call('availability', payload)
    showSuccessToast('添加成功')
    showAdd.value = false
    await load()
  } catch (e) {
    showToast(e.message)
  } finally {
    adding.value = false
  }
}

async function onRemove(s) {
  try {
    await call('availability', { action: 'removeSlot', slotId: s.slotId })
    showSuccessToast('已删除')
    await load()
  } catch (e) {
    showToast(e.message)
  }
}
</script>

<style scoped>
.availability-page { padding-bottom: 120px; }
.slot-list { margin-top: 8px; }
.delete-btn { height: 100%; }
.add-bar { margin: 16px; }
.add-form { padding: 16px 0; }
.add-title { text-align: center; font-size: 16px; font-weight: 500; margin-bottom: 12px; }
</style>
