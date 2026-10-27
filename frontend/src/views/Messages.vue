<template>
  <div>
    <van-nav-bar :title="isAdmin ? '管理消息' : '消息'" left-arrow @click-left="$router.back()" />
    <div class="msg-header">
      <van-button size="mini" type="primary" plain v-if="unreadCount > 0" @click="markAll">全部已读</van-button>
      <van-button size="mini" plain @click="load">刷新</van-button>
    </div>
    <van-empty v-if="!list.length" description="暂无消息" />
    <van-cell-group v-else inset>
      <van-cell v-for="m in list" :key="m.messageId" :class="{ unread: !m.read }" @click="onClickItem(m)">
        <template #title>
          <span class="msg-title">{{ m.typeLabel }}</span>
          <van-tag v-if="!m.read" type="danger" size="medium" style="margin-left: 6px;">新</van-tag>
        </template>
        <template #label>
          <div class="msg-content">{{ m.content }}</div>
          <div class="msg-time">{{ fmtTime(m.createdAt) }}</div>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const user = JSON.parse(localStorage.getItem('user') || 'null')
const isAdmin = user?.role === 'admin'

const list = ref([])
const unreadCount = ref(0)

async function call(name, action, data = {}) {
  const res = await fetch(`https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com/v1/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, token: user?.token, action })
  })
  return res.json()
}

async function load() {
  const r = await call('messages', 'list', { limit: 100 })
  if (r.code === 0) {
    list.value = r.data.list || []
  }
  const c = await call('messages', 'unreadCount')
  if (c.code === 0) unreadCount.value = c.data.count || 0
}

async function markAll() {
  await call('messages', 'markAllRead')
  await load()
}

async function onClickItem(m) {
  if (!m.read) await call('messages', 'markRead', { messageId: m.messageId })
  if (m.linkType && m.linkId) {
    const routes = {
      approval: isAdmin ? '/admin/teachers?tab=approval' : '/teacher/availability',
      course: isAdmin ? '/admin/schedule' : '/teacher/schedule',
      session: isAdmin ? '/admin/schedule' : '/teacher/schedule'
    }
    const p = routes[m.linkType]
    if (p) router.push(p)
  } else {
    await load()
  }
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `今天 ${hh}:${mm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

onMounted(load)
</script>

<style scoped>
.msg-header {
  display: flex; gap: 8px; padding: 8px 16px;
}
.msg-title { font-weight: 600; font-size: 15px; }
.msg-content { font-size: 14px; color: #333; margin: 4px 0; white-space: normal; }
.msg-time { font-size: 12px; color: #999; }
.unread :deep(.van-cell__title),
.unread :deep(.van-cell__label) { font-weight: 600; }
</style>
