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
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
const unread = ref(0)
const GW = 'https://profitable-newt-d2fl5wq6f366cf13.api.tcloudbasegateway.com'

async function load() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!user?.token) return
  try {
    const res = await fetch(`${GW}/v1/functions/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unreadCount', token: user.token })
    })
    const r = await res.json()
    if (r.code === 0) unread.value = r.data.count || 0
  } catch (e) {}
}
onMounted(load)
onActivated(load)
setInterval(load, 30000)
</script>
