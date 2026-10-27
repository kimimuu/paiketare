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
import { call } from '../api'

const unread = ref(0)

async function load() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!user?.token) return
  try {
    const r = await call('messages', { action: 'unreadCount' })
    unread.value = r?.count || 0
  } catch (e) {}
}

onMounted(load)
onActivated(load)
setInterval(load, 30000) // 30 秒刷新
</script>
