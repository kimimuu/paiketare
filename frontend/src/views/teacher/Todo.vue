<template>
  <div>
    <van-nav-bar title="待办" />
    <!-- 任务D13 实现：待确认排课列表 -->
    <van-empty description="暂无待办" />
    <TeacherTabbar />
  </div>
</template>

<script setup>
import TeacherTabbar from '../../components/TeacherTabbar.vue'
</script>
