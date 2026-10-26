<template>
  <div class="admin-wide">
    <van-nav-bar title="老师管理" left-arrow @click-left="$router.back()" />
    <van-tabs v-model:active="tab" sticky>
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
    </van-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../../api'

const tab = ref(0)
const list = ref([])
const loading = ref(false)
const acting = ref('')
const importText = ref('')
const importing = ref(false)
const importResult = ref(null)

function statusText(s) {
  return { pending: '待审批', active: '正常', rejected: '已拒绝' }[s] || s
}
function statusType(s) {
  return { pending: 'warning', active: 'success', rejected: 'danger' }[s] || 'default'
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

onMounted(load)
</script>
