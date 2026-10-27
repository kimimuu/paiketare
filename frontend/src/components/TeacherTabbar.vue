<template>
  <van-tabbar route>
    <van-tabbar-item icon="home-o" to="/teacher/home">首页</van-tabbar-item>
    <van-tabbar-item icon="clock-o" to="/teacher/availability">时间</van-tabbar-item>
    <van-tabbar-item icon="todo-list-o" to="/teacher/todo">待办</van-tabbar-item>
    <van-tabbar-item icon="calendar-o" to="/teacher/schedule">课表</van-tabbar-item>
    <van-tabbar-item icon="envelop-o" to="/teacher/messages" :badge="unread > 0 ? String(unread) : ''">消息</van-tabbar-item>
  </van-tabbar>
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
setInterval(load, 30000) // 30 秒刷新
</script>
