<template>
  <div>
    <van-cell-group inset title="管理功能" style="margin-top: 16px;">
      <van-cell title="排课" is-link to="/admin/booking" icon="edit" />
      <van-cell title="课表" is-link to="/admin/schedule" icon="calendar-o" />
      <van-cell title="老师管理" is-link to="/admin/teachers" icon="friends-o" />
      <van-cell title="学生管理" is-link to="/admin/students" icon="contact" />
      <van-cell title="校区管理" is-link to="/admin/campuses" icon="location-o" />
    </van-cell-group>
    <van-cell-group inset title="系统" style="margin-top: 16px;">
      <van-cell title="消息通知" is-link to="/admin/messages" icon="envelop-o">
        <template #value>
          <van-badge :content="unread > 0 ? unread : ''" />
        </template>
      </van-cell>
    </van-cell-group>
    <van-cell-group inset style="margin-top: 32px;">
      <van-cell title="退出登录" icon="revoke" @click="onLogout" />
    </van-cell-group>
  </div>
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

async function load() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!user?.token) return
  try {
    const r = await call('messages', { action: 'unreadCount' })
    unread.value = r?.count || 0
  } catch (e) {}
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
