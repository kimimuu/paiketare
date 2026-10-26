<template>
  <div>
    <van-nav-bar title="首页" />
    <div class="greeting">{{ store.user?.name }} 老师，您好</div>
    <van-grid :column-num="2" :border="false">
      <van-grid-item icon="clock-o" text="我的时间" to="/teacher/availability" />
      <van-grid-item icon="location-o" text="我的校区" to="/teacher/campuses" />
      <van-grid-item icon="todo-list-o" text="待确认排课" to="/teacher/todo" />
      <van-grid-item icon="calendar-o" text="我的课表" to="/teacher/schedule" />
    </van-grid>
    <TeacherTabbar />
  </div>
</template>

<script setup>
import TeacherTabbar from '../../components/TeacherTabbar.vue'
import { useUserStore } from '../../stores/user'
const store = useUserStore()
</script>

<style scoped>
.greeting { padding: 24px 16px; font-size: 18px; }
</style>
