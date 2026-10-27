<template>
  <div class="admin-wide">
    <van-nav-bar title="老师管理" left-arrow @click-left="$router.back()" right-text="导出时段" @click-right="exportAvail" />
    <van-tabs v-model:active="tab" sticky>
      <!-- 老师列表 -->
      <van-tab title="老师列表">
        <van-empty v-if="!loading && list.length === 0" description="暂无老师" />
        <van-cell v-for="t in list" :key="t.uid" :title="t.name" :label="`${t.phone} · 可带校区 ${t.campusCount} 个`">
          <template #value>
            <van-tag :type="statusType(t.status)" style="margin-right: 8px;">{{ statusText(t.status) }}</van-tag>
            <template v-if="t.status === 'pending'">
              <van-button size="small" type="success" :loading="acting === t.uid" @click="onApprove(t, true)">通过</van-button>
              <van-button size="small" type="danger" style="margin-left: 6px;" :loading="acting === t.uid" @click="onApprove(t, false)">拒绝</van-button>
            </template>
          </template>
        </van-cell>
      </van-tab>

      <!-- 批量导入 -->
      <van-tab title="批量导入">
        <div style="padding: 16px;">
          <van-field v-model="importText" type="textarea" rows="6" autosize
            placeholder="每行一条：姓名,手机号（支持逗号/空格/Tab 分隔）" />
          <van-button round block type="primary" style="margin-top: 16px;" :loading="importing" @click="onImport">导入</van-button>
        </div>
        <template v-if="importResult">
          <van-cell title="导入结果" :value="`成功 ${importResult.created} 条`" />
          <van-cell v-for="(s, i) in importResult.skipped" :key="i" :title="`${s.name} ${s.phone}`" :label="s.reason" />
        </template>
      </van-tab>

      <!-- 时间审批 -->
      <van-tab title="时间审批">
        <div class="filter-bar">
          <van-radio-group v-model="filterStatus" direction="horizontal" @change="loadApprovals">
            <van-radio name="">全部</van-radio>
            <van-radio name="pending">待审批</van-radio>
            <van-radio name="approved">已通过</van-radio>
            <van-radio name="rejected">已驳回</van-radio>
          </van-radio-group>
        </div>
        <van-empty v-if="!approvalsLoading && approvals.length === 0" description="暂无审批" />
        <van-cell v-for="a in approvals" :key="a.approvalId"
          :title="a.teacherName"
          :label="`${statusText(a.status)} · ${formatTime(a.createdAt)}`"
          is-link
          @click="openApprovalDetail(a.approvalId)">
          <template #value>
            <van-tag :type="statusType(a.status)">{{ statusText(a.status) }}</van-tag>
          </template>
        </van-cell>
      </van-tab>
    </van-tabs>

    <!-- 审批详情弹窗 -->
    <van-popup v-model:show="showDetail" position="bottom" round :style="{ height: '80%' }">
      <div class="detail-wrap" v-if="detail">
        <div class="detail-header">
          <span>{{ detail.teacherName }} 的修改申请</span>
          <van-tag :type="statusType(detail.status)">{{ statusText(detail.status) }}</van-tag>
        </div>

        <div class="compare-section">
          <div class="compare-col">
            <div class="col-title">当前生效</div>
            <div v-if="!detail.old.slots.length" class="empty">无时段</div>
            <div v-for="(s, i) in detail.old.slots" :key="'o'+i" class="slot-item old">{{ formatSlot(s) }}</div>
            <div class="campus-line">校区: {{ detail.old.campuses.length }} 个</div>
          </div>
          <div class="compare-col">
            <div class="col-title">申请修改</div>
            <div v-if="!detail.payload.slots.length" class="empty">无时段</div>
            <div v-for="(s, i) in detail.payload.slots" :key="'n'+i" class="slot-item new">{{ formatSlot(s) }}</div>
            <div class="campus-line">校区: {{ detail.payload.campuses.length }} 个</div>
          </div>
        </div>

        <div v-if="conflictError" class="conflict-box">
          <van-icon name="warning-o" color="#ee0a24" />
          <span>{{ conflictError }}</span>
          <div v-for="(c, i) in conflicts" :key="i" class="conflict-item">
            {{ c.date }} {{ c.startTime }}-{{ c.endTime }} {{ c.studentName }}
          </div>
        </div>

        <div v-if="detail.status === 'rejected' && detail.rejectReason" class="reject-reason">
          驳回原因: {{ detail.rejectReason }}
        </div>

        <div class="detail-actions" v-if="detail.status === 'pending'">
          <van-button block type="success" :loading="approving" @click="onApproveChange">通过</van-button>
          <van-button block type="danger" style="margin-top: 8px;" :loading="rejecting" @click="onRejectChange">驳回</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 驳回原因输入 -->
    <van-dialog v-model:show="showReject" title="驳回原因" show-cancel-button :close-on-click-overlay="false" @confirm="confirmReject">
      <van-field v-model="rejectReason" type="textarea" placeholder="选填，老师可见" rows="3" />
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../../api'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const tab = ref(0)
const list = ref([])
const loading = ref(false)
const acting = ref('')
const importText = ref('')
const importing = ref(false)
const importResult = ref(null)

// 审批
const approvals = ref([])
const approvalsLoading = ref(false)
const filterStatus = ref('')
const showDetail = ref(false)
const detail = ref(null)
const approving = ref(false)
const rejecting = ref(false)
const conflictError = ref('')
const conflicts = ref([])
const showReject = ref(false)
const rejectReason = ref('')

function statusText(s) {
  return { pending: '待审批', active: '正常', rejected: '已拒绝', approved: '已通过', withdrawn: '已撤回' }[s] || s
}
function statusType(s) {
  return { pending: 'warning', active: 'success', rejected: 'danger', approved: 'success', withdrawn: 'default' }[s] || 'default'
}
function formatTime(t) {
  return t ? t.replace('T', ' ').slice(0, 16) : ''
}
function formatSlot(s) {
  const label = s.type === 'weekly' ? WEEKDAYS[s.weekday] : s.date
  return `${label} ${s.startTime}-${s.endTime}`
}

async function load() {
  loading.value = true
  try {
    const data = await call('auth', { action: 'listTeachers' })
    list.value = data.list
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

// 导出老师可用时段
async function exportAvail() {
  try {
    showToast({ message: '生成中...', forbidClick: true, duration: 0 })
    const data = await call('course', { action: 'exportAvailabilities' })
    const a = document.createElement('a')
    a.href = data.dataUrl
    a.download = data.fileName
    a.click()
    showToast('导出成功')
  } catch (e) {
    showToast(e.message || '导出失败')
  }
}

async function loadApprovals() {
  approvalsLoading.value = true
  try {
    const data = await call('approval', { action: 'list', status: filterStatus.value || undefined })
    approvals.value = data.list
  } catch (e) {
    showToast(e.message)
  } finally {
    approvalsLoading.value = false
  }
}

async function onApprove(t, approve) {
  acting.value = t.uid
  try {
    await call('auth', { action: 'approveTeacher', uid: t.uid, approve })
    showSuccessToast(approve ? '已通过' : '已拒绝')
    await load()
  } catch (e) {
    showToast(e.message)
  } finally {
    acting.value = ''
  }
}

async function onImport() {
  const lines = importText.value.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  for (const line of lines) {
    const parts = line.split(/[,，\s\t]+/).filter(Boolean)
    if (parts.length >= 2) {
      items.push({ name: parts[0], phone: parts[1] })
    }
  }
  if (items.length === 0) {
    showToast('请按格式输入：姓名,手机号')
    return
  }
  importing.value = true
  try {
    const data = await call('auth', { action: 'importTeachers', list: items })
    importResult.value = data
    showSuccessToast(`成功导入 ${data.created} 条`)
    await load()
  } catch (e) {
    showToast(e.message)
  } finally {
    importing.value = false
  }
}

async function openApprovalDetail(approvalId) {
  conflictError.value = ''
  conflicts.value = []
  try {
    detail.value = await call('approval', { action: 'get', approvalId })
    showDetail.value = true
  } catch (e) {
    showToast(e.message)
  }
}

async function onApproveChange() {
  approving.value = true
  try {
    await call('approval', { action: 'approve', approvalId: detail.value.approvalId })
    showSuccessToast('已通过')
    showDetail.value = false
    await loadApprovals()
  } catch (e) {
    // 冲突错误：e.conflicts 附带
    if (e.conflicts) {
      conflictError.value = e.message
      conflicts.value = e.conflicts
    } else {
      showToast(e.message)
    }
  } finally {
    approving.value = false
  }
}

function onRejectChange() {
  rejectReason.value = ''
  showReject.value = true
}

async function confirmReject() {
  rejecting.value = true
  try {
    await call('approval', { action: 'reject', approvalId: detail.value.approvalId, rejectReason: rejectReason.value })
    showSuccessToast('已驳回')
    showReject.value = false
    showDetail.value = false
    await loadApprovals()
  } catch (e) {
    showToast(e.message)
  } finally {
    rejecting.value = false
  }
}

onMounted(() => {
  load()
  loadApprovals()
})
</script>

<style scoped>
.filter-bar { padding: 12px 16px; }
.detail-wrap { padding: 16px; height: 100%; overflow-y: auto; }
.detail-header { display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 500; margin-bottom: 12px; }
.compare-section { display: flex; gap: 12px; margin-bottom: 16px; }
.compare-col { flex: 1; }
.col-title { font-size: 13px; color: #969799; margin-bottom: 8px; }
.slot-item { padding: 6px 8px; font-size: 13px; border-radius: 4px; margin-bottom: 4px; }
.slot-item.old { background: #f7f8fa; color: #646566; text-decoration: line-through; }
.slot-item.new { background: #e8f7ee; color: #07c160; }
.campus-line { font-size: 13px; color: #969799; margin-top: 8px; }
.empty { font-size: 13px; color: #969799; padding: 6px 0; }
.conflict-box { background: #fef0f0; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #ee0a24; }
.conflict-item { margin-top: 4px; padding-left: 16px; }
.reject-reason { background: #fff7e8; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #ff976a; }
.detail-actions { margin-top: 16px; padding-bottom: 24px; }
</style>
