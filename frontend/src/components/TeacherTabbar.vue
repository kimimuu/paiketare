<template>
  <van-tabbar route>
    <van-tabbar-item icon="home-o" to="/teacher/home">首页</van-tabbar-item>
    <van-tabbar-item icon="clock-o" to="/teacher/availability">时间</van-tabbar-item>
    <van-tabbar-item icon="todo-list-o" to="/teacher/todo">待办</van-tabbar-item>
    <van-tabbar-item icon="calendar-o" to="/teacher/schedule">课表</van-tabbar-item>
    <van-tabbar-item icon="envelop-o" to="/teacher/messages" :badge="unread > 0 ? String(unread) : ''">消息</van-tabbar-item>
    <van-tabbar-item icon="setting-o" @click="onSettings">我的</van-tabbar-item>
  </van-tabbar>

  <!-- 设置弹窗 -->
  <van-dialog v-model:show="showSettings" show-cancel-button title="设置">
    <div class="settings-content">
      <div class="user-info">
        <van-image round width="48" height="48" :src="user?.avatar || defaultAvatar" />
        <div class="user-detail">
          <div class="user-name">{{ user?.name || user?.phone || '老师' }}</div>
          <div class="user-phone">{{ user?.phone }}</div>
        </div>
      </div>
      <van-cell-group inset>
        <van-cell title="修改密码" is-link to="/change-password" icon="shield-o" />
        <van-cell title="退出登录" icon="revoke" @click="onLogout" />
      </van-cell-group>
    </div>
  </van-dialog>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { call } from '../api'
import { useUserStore } from '../stores/user'
import { showConfirmDialog, showSuccessToast } from 'vant'

const router = useRouter()
const store = useUserStore()
const unread = ref(0)
const showSettings = ref(false)
const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4MCA0ODAiPjxjaXJjbGUgY3g9IjI0MCIgY3k9IjE4MCIgcj0iODAiIGZpbGw9IiM5OTkiLz48cGF0aCBkPSJNMCA0ODBjMC0xMzIuNTAxIDEwOC4xODktMjQwIDI0MC0yNDBzIDI0MCAxMDcuNDk5IDI0MCAyNDB4eDAuZW1weT48L3BhdGggZmlsbD0iIzk5OSIvPjwvc3ZnPg=='

const user = ref(null)
onMounted(() => { user.value = JSON.parse(localStorage.getItem('user') || 'null') })

async function load() {
  const u = JSON.parse(localStorage.getItem('user') || 'null')
  if (!u?.token) return
  try {
    const r = await call('messages', { action: 'unreadCount' })
    unread.value = r?.count || 0
  } catch (e) {}
}

function onSettings() {
  user.value = JSON.parse(localStorage.getItem('user') || 'null')
  showSettings.value = true
}

async function onLogout() {
  try {
    await showConfirmDialog({ title: '退出登录', message: '确定要退出登录吗？' })
  } catch { return }
  store.logout()
  localStorage.removeItem('token')
  showSuccessToast('已退出')
  router.replace('/login')
}

onMounted(load)
onActivated(load)
setInterval(load, 30000)
</script>

<style scoped>
.settings-content { padding: 8px 0; }
.user-info {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 16px 8px;
}
.user-detail .user-name { font-weight: 500; font-size: 16px; }
.user-detail .user-phone { font-size: 13px; color: #969799; }
</style>
