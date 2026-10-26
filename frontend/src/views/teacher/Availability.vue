<template>
  <div class="availability-page">
    <van-nav-bar title="我的时间与校区" />

    <!-- 审批中横幅 -->
    <van-notice-bar v-if="pending" left-icon="volume-o" :color="'#ff976a'" background="#fff7e8">
      有一个待审批申请，审批通过前旧时间继续生效
      <van-button size="mini" type="warning" style="margin-left:8px" @click="onWithdraw">撤回</van-button>
    </van-notice-bar>

    <van-tabs v-model:active="tab">
      <van-tab title="时间" />
      <van-tab title="校区" />
    </van-tabs>

    <!-- 时间 Tab -->
    <div v-show="tab === 0" class="slot-list">
      <van-swipe-cell v-for="s in weeklySlots" :key="'w'+s._key">
        <van-cell :title="formatSlot(s)" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :disabled="!!pending" @click="onRemove(s)" />
        </template>
      </van-swipe-cell>
      <van-swipe-cell v-for="s in dateSlots" :key="'d'+s._key">
        <van-cell :title="formatSlot(s)" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :disabled="!!pending" @click="onRemove(s)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!slots.length" description="暂无时段，点击下方添加" />
      <div class="add-bar">
        <van-button block type="primary" icon="plus" :disabled="!!pending" @click="openAdd">添加时段</van-button>
      </div>
    </div>

    <!-- 校区 Tab -->
    <div v-show="tab === 1" class="campus-grid">
      <div
        v-for="c in allCampuses"
        :key="c.campusId"
        class="campus-card"
        :class="{ active: campuses.includes(c.campusId) }"
        @click="toggleCampus(c.campusId)"
      >
        <div class="campus-name">
          {{ c.name }}
          <van-icon v-if="campuses.includes(c.campusId)" name="success" class="check-icon" />
        </div>
        <div class="campus-address">{{ c.address }}</div>
      </div>
      <van-empty v-if="!allCampuses.length" description="暂无校区" />
    </div>

    <!-- 提交栏 -->
    <div class="submit-bar" v-if="!pending">
      <van-button block type="primary" :loading="submitting" @click="onSubmit">提交审批</van-button>
    </div>

    <!-- 审批历史 -->
    <div v-if="approvalHistory.length" class="history">
      <div class="history-title">审批历史</div>
      <van-cell v-for="a in approvalHistory" :key="a.approvalId"
        :title="statusText(a.status)" :label="formatTime(a.createdAt)">
        <template #value>
          <van-tag :type="statusType(a.status)">{{ statusText(a.status) }}</van-tag>
        </template>
      </van-cell>
    </div>

    <!-- 添加表单 -->
    <van-popup v-model:show="showAdd" position="bottom" round>
      <div class="add-form">
        <div class="add-title">添加时段</div>
        <van-field
          v-model="slotType"
          is-link readonly
          label="类型"
          :placeholder="slotType === 'weekly' ? '每周规律' : '临时日期'"
          @click="showType = true"
        />
        <van-field
          v-if="slotType === 'weekly'"
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
        <van-field v-model="form.startTime" is-link readonly label="开始时间" placeholder="选择开始时间" @click="openTime('start')" />
        <van-field v-model="form.endTime" is-link readonly label="结束时间" placeholder="选择结束时间" @click="openTime('end')" />
        <div style="margin: 16px;">
          <van-button block type="primary" :loading="adding" @click="onAdd">确定添加</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showType" position="bottom" round>
      <van-picker :columns="typeColumns" @confirm="onTypeConfirm" @cancel="showType = false" />
    </van-popup>
    <van-popup v-model:show="showWeekday" position="bottom" round>
      <van-picker :columns="weekdayColumns" @confirm="onWeekdayConfirm" @cancel="showWeekday = false" />
    </van-popup>
    <van-popup v-model:show="showDate" position="bottom" round>
      <van-date-picker v-model="dateValue" title="选择日期" :min-date="minDate" @confirm="onDateConfirm" @cancel="showDate = false" />
    </van-popup>
    <van-popup v-model:show="showTime" position="bottom" round>
      <van-time-picker v-model="timeValue" title="选择时间" @confirm="onTimeConfirm" @cancel="showTime = false" />
    </van-popup>

    <TeacherTabbar />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { call } from '../../api'
import TeacherTabbar from '../../components/TeacherTabbar.vue'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const tab = ref(0)
const slots = ref([]) // 本地编辑的时段列表
const campuses = ref([]) // 本地编辑的校区列表
const allCampuses = ref([])
const pending = ref(null) // 当前待审批单
const approvalHistory = ref([])
const submitting = ref(false)
const loading = ref(true)

const showAdd = ref(false)
const adding = ref(false)
const slotType = ref('weekly')
const form = ref({ weekday: null, date: '', startTime: '', endTime: '' })

const showType = ref(false)
const typeColumns = [{ text: '每周规律', value: 'weekly' }, { text: '临时日期', value: 'date' }]
const showWeekday = ref(false)
const weekdayColumns = WEEKDAYS.map((text, value) => ({ text, value }))
const weekdayText = computed(() => (form.value.weekday === null ? '' : WEEKDAYS[form.value.weekday]))
const showDate = ref(false)
const dateValue = ref([])
const minDate = new Date()
const showTime = ref(false)
const timeValue = ref(['18', '00'])
const timeTarget = ref('start')

const weeklySlots = computed(() => slots.value.filter(s => s.type === 'weekly').sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)))
const dateSlots = computed(() => slots.value.filter(s => s.type === 'date').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)))

function formatSlot(s) {
  const label = s.type === 'weekly' ? WEEKDAYS[s.weekday] : s.date
  return `${label} ${s.startTime}-${s.endTime}`
}

function statusText(s) {
  return { pending: '审批中', approved: '已通过', rejected: '已驳回', withdrawn: '已撤回' }[s] || s
}
function statusType(s) {
  return { pending: 'warning', approved: 'success', rejected: 'danger', withdrawn: 'default' }[s] || 'default'
}
function formatTime(t) {
  return t ? t.replace('T', ' ').slice(0, 16) : ''
}

onMounted(async () => {
  try {
    const [mine, pend, camps, hist] = await Promise.all([
      call('availability', { action: 'listMy' }),
      call('availability', { action: 'getMyPendingChange' }),
      call('baseData', { action: 'listCampuses' }),
      call('availability', { action: 'listMyApprovals' })
    ])
    allCampuses.value = camps.list || []
    if (pend) {
      pending.value = pend
      slots.value = (pend.payload.slots || []).map((s, i) => ({ ...s, _key: i }))
      campuses.value = pend.payload.campuses || []
    } else {
      slots.value = (mine.slots || []).map((s, i) => ({ ...s, _key: i }))
      campuses.value = mine.campuses || []
    }
    approvalHistory.value = hist.list || []
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
})

function toggleCampus(id) {
  if (pending.value) return
  const i = campuses.value.indexOf(id)
  if (i >= 0) campuses.value.splice(i, 1)
  else campuses.value.push(id)
}

function openAdd() {
  slotType.value = 'weekly'
  form.value = { weekday: null, date: '', startTime: '', endTime: '' }
  showAdd.value = true
}

function onTypeConfirm({ selectedOptions }) {
  slotType.value = selectedOptions[0].value
  showType.value = false
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

function onAdd() {
  const f = form.value
  if (slotType.value === 'weekly' && f.weekday === null) return showToast('请选择星期几')
  if (slotType.value === 'date' && !f.date) return showToast('请选择日期')
  if (!f.startTime || !f.endTime) return showToast('请选择起止时间')
  const slot = {
    type: slotType.value,
    weekday: slotType.value === 'weekly' ? f.weekday : null,
    date: slotType.value === 'date' ? f.date : null,
    startTime: f.startTime,
    endTime: f.endTime,
    _key: Date.now()
  }
  slots.value.push(slot)
  showAdd.value = false
}

function onRemove(s) {
  const i = slots.value.findIndex(x => x._key === s._key)
  if (i >= 0) slots.value.splice(i, 1)
}

async function onSubmit() {
  try {
    await showConfirmDialog({ title: '提交审批', message: `共 ${slots.value.length} 个时段、${campuses.value.length} 个校区，确认提交？` })
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      slots: slots.value.map(({ _key, ...rest }) => rest),
      campuses: campuses.value
    }
    const res = await call('availability', { action: 'submitChange', ...payload })
    showSuccessToast('已提交审批')
    pending.value = { approvalId: res.approvalId, status: 'pending', payload }
    approvalHistory.value.unshift({ approvalId: res.approvalId, status: 'pending', createdAt: new Date().toISOString() })
  } catch (e) {
    showToast(e.message)
  } finally {
    submitting.value = false
  }
}

async function onWithdraw() {
  try {
    await showConfirmDialog({ title: '撤回申请', message: '确定撤回待审批申请？' })
  } catch {
    return
  }
  try {
    await call('availability', { action: 'withdrawApproval', approvalId: pending.value.approvalId })
    showSuccessToast('已撤回')
    // 恢复为当前生效数据
    const mine = await call('availability', { action: 'listMy' })
    slots.value = (mine.slots || []).map((s, i) => ({ ...s, _key: i }))
    campuses.value = mine.campuses || []
    pending.value = null
    if (approvalHistory.value[0]?.approvalId) {
      approvalHistory.value[0].status = 'withdrawn'
    }
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
.campus-grid { display: flex; flex-wrap: wrap; padding: 12px; gap: 12px; }
.campus-card {
  width: calc(50% - 6px);
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  background: #fff;
}
.campus-card.active { border-color: #1989fa; background: #ecf5ff; }
.campus-name { font-size: 15px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }
.check-icon { color: #1989fa; }
.campus-address { font-size: 12px; color: #969799; margin-top: 4px; }
.submit-bar {
  position: fixed;
  bottom: 50px;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: #fff;
  box-shadow: 0 -1px 4px rgba(0,0,0,0.05);
  z-index: 10;
}
.history { margin-top: 16px; border-top: 8px solid #f7f8fa; }
.history-title { padding: 12px 16px; font-size: 14px; color: #969799; }
</style>
