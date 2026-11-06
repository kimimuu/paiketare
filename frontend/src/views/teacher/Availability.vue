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
      <van-tab title="不接课" />
      <van-tab title="校区" />
    </van-tabs>

    <!-- ============ 时间 Tab（normal，走审批）============ -->
    <div v-show="tab === 0" class="slot-list">
      <van-swipe-cell v-for="s in normalWeekly" :key="'nw'+s._key">
        <van-cell :title="formatSlot(s)" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :disabled="!!pending" @click="onRemoveNormal(s)" />
        </template>
      </van-swipe-cell>
      <van-swipe-cell v-for="s in normalDate" :key="'nd'+s._key">
        <van-cell :title="formatSlot(s)" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :disabled="!!pending" @click="onRemoveNormal(s)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!normalSlots.length" description="暂无可用时段，点击下方添加" />
      <div class="add-bar">
        <van-button block type="primary" icon="plus" :disabled="!!pending" @click="openAddNormal">添加可用时段</van-button>
      </div>
    </div>

    <!-- ============ 不接课 Tab（blocked，实时生效）============ -->
    <div v-show="tab === 1" class="slot-list">
      <div class="tip-bar">
        <van-icon name="info-o" />
        <span>标记这段时间有事/请假，排课系统会自动避开。实时生效，无需审批。</span>
      </div>
      <van-swipe-cell v-for="s in blockedWeekly" :key="'bw'+s.slotId">
        <van-cell :title="formatSlot(s)" :label="'每周不接课'" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :loading="removingBlocked === s.slotId" @click="onRemoveBlocked(s)" />
        </template>
      </van-swipe-cell>
      <van-swipe-cell v-for="s in blockedDate" :key="'bd'+s.slotId">
        <van-cell :title="formatSlot(s)" :label="s.date + ' 不接课'" />
        <template #right>
          <van-button square type="danger" text="删除" class="delete-btn" :loading="removingBlocked === s.slotId" @click="onRemoveBlocked(s)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!blockedSlots.length" description="暂无不接课时间" />
      <div class="add-bar">
        <van-button block type="warning" icon="plus" @click="openAddBlocked">添加不接课时间</van-button>
      </div>
    </div>

    <!-- ============ 校区 Tab ============ -->
    <div v-show="tab === 2" class="campus-grid">
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

    <!-- 提交栏（只有时间 tab + 非 pending 时显示）-->
    <div class="submit-bar" v-if="tab === 0 && !pending">
      <van-button block type="primary" :loading="submitting" @click="onSubmit">提交时间/校区修改审批</van-button>
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

    <!-- ============ 添加可用时段 popup ============ -->
    <van-popup v-model:show="showAddNormal" position="bottom" round>
      <div class="add-form">
        <div class="add-title">添加可用时段</div>
        <van-field v-model="slotType" is-link readonly label="类型" :placeholder="slotType === 'weekly' ? '每周规律' : '临时日期'" @click="showType = true" />
        <van-field v-if="slotType === 'weekly'" v-model="weekdayText" is-link readonly label="星期" placeholder="选择星期几" @click="showWeekday = true" />
        <van-field v-else v-model="form.date" is-link readonly label="日期" placeholder="选择日期" @click="showDate = true" />
        <van-field v-model="form.startTime" is-link readonly label="开始时间" placeholder="选择开始时间" @click="openTime('start')" />
        <van-field v-model="form.endTime" is-link readonly label="结束时间" placeholder="选择结束时间" @click="openTime('end')" />
        <div style="margin: 16px;">
          <van-button block type="primary" :loading="addingNormal" @click="onAddNormal">确定</van-button>
        </div>
      </div>
    </van-popup>

    <!-- ============ 添加不接课时段 popup ============ -->
    <van-popup v-model:show="showAddBlocked" position="bottom" round>
      <div class="add-form">
        <div class="add-title">添加不接课时间</div>
        <van-field v-model="blockedType" is-link readonly label="类型" :placeholder="blockedType === 'weekly' ? '每周固定' : '某天有事'" @click="showBlockedType = true" />
        <van-field v-if="blockedType === 'weekly'" v-model="blockedWeekdayText" is-link readonly label="星期" placeholder="选择星期几" @click="showBlockedWeekday = true" />
        <van-field v-else v-model="blockedForm.date" is-link readonly label="日期" placeholder="选择日期" @click="showBlockedDate = true" />
        <van-field v-model="blockedForm.startTime" is-link readonly label="开始时间" placeholder="选择开始时间" @click="openBlockedTime('start')" />
        <van-field v-model="blockedForm.endTime" is-link readonly label="结束时间" placeholder="选择结束时间" @click="openBlockedTime('end')" />
        <div style="margin: 16px;">
          <van-button block type="warning" :loading="addingBlocked" @click="onAddBlocked">确定添加</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 公共 pickers -->
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

    <!-- Blocked 专属 pickers -->
    <van-popup v-model:show="showBlockedType" position="bottom" round>
      <van-picker :columns="typeColumns" @confirm="onBlockedTypeConfirm" @cancel="showBlockedType = false" />
    </van-popup>
    <van-popup v-model:show="showBlockedWeekday" position="bottom" round>
      <van-picker :columns="weekdayColumns" @confirm="onBlockedWeekdayConfirm" @cancel="showBlockedWeekday = false" />
    </van-popup>
    <van-popup v-model:show="showBlockedDate" position="bottom" round>
      <van-date-picker v-model="blockedDateValue" title="选择日期" :min-date="minDate" @confirm="onBlockedDateConfirm" @cancel="showBlockedDate = false" />
    </van-popup>
    <van-popup v-model:show="showBlockedTime" position="bottom" round>
      <van-time-picker v-model="blockedTimeValue" title="选择时间" @confirm="onBlockedTimeConfirm" @cancel="showBlockedTime = false" />
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
const normalSlots = ref([])   // kind=normal，本地编辑待审批
const blockedSlots = ref([])   // kind=blocked，实时生效
const campuses = ref([])
const allCampuses = ref([])
const pending = ref(null)
const approvalHistory = ref([])
const submitting = ref(false)

const typeColumns = [{ text: '每周规律', value: 'weekly' }, { text: '临时日期', value: 'date' }]
const weekdayColumns = WEEKDAYS.map((text, value) => ({ text, value }))
const minDate = new Date()

// 状态
const loading = ref(true)
const removingBlocked = ref(null)

// ============ Normal 添加状态 ============
const showAddNormal = ref(false)
const addingNormal = ref(false)
const slotType = ref('weekly')
const form = ref({ weekday: null, date: '', startTime: '', endTime: '' })
const showType = ref(false)
const weekdayText = computed(() => (form.value.weekday === null ? '' : WEEKDAYS[form.value.weekday]))
const showWeekday = ref(false)
const showDate = ref(false)
const dateValue = ref([])
const showTime = ref(false)
const timeValue = ref(['18', '00'])
const timeTarget = ref('start')

// ============ Blocked 添加状态 ============
const showAddBlocked = ref(false)
const addingBlocked = ref(false)
const blockedType = ref('weekly')
const blockedForm = ref({ weekday: null, date: '', startTime: '', endTime: '' })
const showBlockedType = ref(false)
const blockedWeekdayText = computed(() => (blockedForm.value.weekday === null ? '' : WEEKDAYS[blockedForm.value.weekday]))
const showBlockedWeekday = ref(false)
const showBlockedDate = ref(false)
const blockedDateValue = ref([])
const showBlockedTime = ref(false)
const blockedTimeValue = ref(['18', '00'])
const blockedTimeTarget = ref('start')

// ============ 计算属性 ============
const normalWeekly = computed(() => normalSlots.value.filter(s => s.type === 'weekly').sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)))
const normalDate = computed(() => normalSlots.value.filter(s => s.type === 'date').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)))
const blockedWeekly = computed(() => blockedSlots.value.filter(s => s.type === 'weekly').sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)))
const blockedDate = computed(() => blockedSlots.value.filter(s => s.type === 'date').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)))

// ============ 工具函数 ============
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

// ============ 初始化 ============
onMounted(async () => {
  try {
    const [mine, pend, camps, hist] = await Promise.all([
      call('availability', { action: 'listMy' }),
      call('availability', { action: 'getMyPendingChange' }),
      call('baseData', { action: 'listCampuses' }),
      call('availability', { action: 'listMyApprovals' })
    ])
    allCampuses.value = camps.list || []

    // blocked 永远用实时数据（不走审批）
    blockedSlots.value = (mine.slots || []).filter(s => s.kind === 'blocked')

    if (pend) {
      pending.value = pend
      normalSlots.value = (pend.payload.slots || []).map((s, i) => ({ ...s, _key: i }))
      campuses.value = pend.payload.campuses || []
    } else {
      normalSlots.value = (mine.slots || []).filter(s => (s.kind || 'normal') !== 'blocked').map((s, i) => ({ ...s, _key: i }))
      campuses.value = mine.campuses || []
    }
    approvalHistory.value = hist.list || []
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
})

// ============ 校区 ============
function toggleCampus(id) {
  if (pending.value) return
  const i = campuses.value.indexOf(id)
  if (i >= 0) campuses.value.splice(i, 1)
  else campuses.value.push(id)
}

// ============ Normal（可用时段）CRUD ============
function openAddNormal() {
  slotType.value = 'weekly'
  form.value = { weekday: null, date: '', startTime: '', endTime: '' }
  showAddNormal.value = true
}
function onAddNormal() {
  const f = form.value
  if (slotType.value === 'weekly' && f.weekday === null) return showToast('请选择星期几')
  if (slotType.value === 'date' && !f.date) return showToast('请选择日期')
  if (!f.startTime || !f.endTime) return showToast('请选择起止时间')
  normalSlots.value.push({
    type: slotType.value,
    weekday: slotType.value === 'weekly' ? f.weekday : null,
    date: slotType.value === 'date' ? f.date : null,
    startTime: f.startTime,
    endTime: f.endTime,
    kind: 'normal',
    _key: Date.now()
  })
  showAddNormal.value = false
}
function onRemoveNormal(s) {
  const i = normalSlots.value.findIndex(x => x._key === s._key)
  if (i >= 0) normalSlots.value.splice(i, 1)
}
function onTypeConfirm({ selectedOptions }) { slotType.value = selectedOptions[0].value; showType.value = false }
function onWeekdayConfirm({ selectedOptions }) { form.value.weekday = selectedOptions[0].value; showWeekday.value = false }
function onDateConfirm({ selectedValues }) { form.value.date = selectedValues.join('-'); showDate.value = false }
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
async function onSubmit() {
  try { await showConfirmDialog({ title: '提交审批', message: `共 ${normalSlots.value.length} 个可用时段、${campuses.value.length} 个校区，确认提交？` }) } catch { return }
  submitting.value = true
  try {
    const payload = {
      slots: normalSlots.value.map(({ _key, ...rest }) => rest),
      campuses: campuses.value
    }
    const res = await call('availability', { action: 'submitChange', ...payload })
    showSuccessToast('已提交审批')
    pending.value = { approvalId: res.approvalId, status: 'pending', payload }
    approvalHistory.value.unshift({ approvalId: res.approvalId, status: 'pending', createdAt: new Date().toISOString() })
  } catch (e) { showToast(e.message) }
  finally { submitting.value = false }
}
async function onWithdraw() {
  try { await showConfirmDialog({ title: '撤回申请', message: '确定撤回待审批申请？' }) } catch { return }
  try {
    await call('availability', { action: 'withdrawApproval', approvalId: pending.value.approvalId })
    showSuccessToast('已撤回')
    const mine = await call('availability', { action: 'listMy' })
    normalSlots.value = (mine.slots || []).filter(s => s.kind !== 'blocked').map((s, i) => ({ ...s, _key: i }))
    blockedSlots.value = (mine.slots || []).filter(s => s.kind === 'blocked')
    campuses.value = mine.campuses || []
    pending.value = null
    if (approvalHistory.value[0]?.approvalId) approvalHistory.value[0].status = 'withdrawn'
  } catch (e) { showToast(e.message) }
}

// ============ Blocked（不接课）CRUD —— 实时生效 ============
function openAddBlocked() {
  blockedType.value = 'weekly'
  blockedForm.value = { weekday: null, date: '', startTime: '', endTime: '' }
  showAddBlocked.value = true
}
async function onAddBlocked() {
  const f = blockedForm.value
  if (blockedType.value === 'weekly' && f.weekday === null) return showToast('请选择星期几')
  if (blockedType.value === 'date' && !f.date) return showToast('请选择日期')
  if (!f.startTime || !f.endTime) return showToast('请选择起止时间')
  addingBlocked.value = true
  try {
    const res = await call('availability', {
      action: 'addBlockedSlot',
      type: blockedType.value,
      weekday: blockedType.value === 'weekly' ? f.weekday : null,
      date: blockedType.value === 'date' ? f.date : null,
      startTime: f.startTime,
      endTime: f.endTime
    })
    showSuccessToast('已添加，实时生效')
    blockedSlots.value.push({
      slotId: res.slotId,
      type: blockedType.value,
      weekday: blockedType.value === 'weekly' ? f.weekday : null,
      date: blockedType.value === 'date' ? f.date : null,
      startTime: f.startTime,
      endTime: f.endTime,
      kind: 'blocked'
    })
    showAddBlocked.value = false
  } catch (e) { showToast(e.message) }
  finally { addingBlocked.value = false }
}
async function onRemoveBlocked(s) {
  try { await showConfirmDialog({ title: '删除不接课时间', message: `确定删除「${formatSlot(s)}」？` }) } catch { return }
  removingBlocked.value = s.slotId
  try {
    await call('availability', { action: 'removeBlockedSlot', slotId: s.slotId })
    showSuccessToast('已删除')
    blockedSlots.value = blockedSlots.value.filter(x => x.slotId !== s.slotId)
  } catch (e) { showToast(e.message) }
  finally { removingBlocked.value = null }
}
function onBlockedTypeConfirm({ selectedOptions }) { blockedType.value = selectedOptions[0].value; showBlockedType.value = false }
function onBlockedWeekdayConfirm({ selectedOptions }) { blockedForm.value.weekday = selectedOptions[0].value; showBlockedWeekday.value = false }
function onBlockedDateConfirm({ selectedValues }) { blockedForm.value.date = selectedValues.join('-'); showBlockedDate.value = false }
function openBlockedTime(target) {
  blockedTimeTarget.value = target
  const cur = target === 'start' ? blockedForm.value.startTime : blockedForm.value.endTime
  blockedTimeValue.value = cur ? cur.split(':') : ['18', '00']
  showBlockedTime.value = true
}
function onBlockedTimeConfirm({ selectedValues }) {
  const t = selectedValues.join(':')
  if (blockedTimeTarget.value === 'start') blockedForm.value.startTime = t
  else blockedForm.value.endTime = t
  showBlockedTime.value = false
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
  width: calc(50% - 6px); box-sizing: border-box; padding: 12px;
  border: 1px solid #ebedf0; border-radius: 8px; background: #fff;
}
.campus-card.active { border-color: #1989fa; background: #ecf5ff; }
.campus-name { font-size: 15px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }
.check-icon { color: #1989fa; }
.campus-address { font-size: 12px; color: #969799; margin-top: 4px; }
.submit-bar {
  position: fixed; bottom: 50px; left: 0; right: 0;
  padding: 12px 16px; background: #fff;
  box-shadow: 0 -1px 4px rgba(0,0,0,0.05); z-index: 10;
}
.history { margin-top: 16px; border-top: 8px solid #f7f8fa; }
.history-title { padding: 12px 16px; font-size: 14px; color: #969799; }
.tip-bar {
  display: flex; align-items: flex-start; gap: 8px;
  margin: 8px 12px; padding: 10px 12px;
  background: #fffbe6; border-radius: 8px;
  font-size: 13px; color: #ad6800; line-height: 1.5;
}
</style>
