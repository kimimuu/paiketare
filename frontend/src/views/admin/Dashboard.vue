<template>
  <div class="admin-wide">
    <van-nav-bar title="管理后台" />
    <!-- 任务E15 实现：今日课程、待确认、待审批统计 -->
    <van-grid :column-num="3" style="margin-top: 12px;">
      <van-grid-item text="今日课程"><template #icon><span class="num">-</span></template></van-grid-item>
      <van-grid-item text="待确认"><template #icon><span class="num">-</span></template></van-grid-item>
      <van-grid-item text="待审批"><template #icon><span class="num">-</span></template></van-grid-item>
    </van-grid>
    <AdminMenu />
  </div>
</template>

<script setup>
import AdminMenu from '../../components/AdminMenu.vue'
</script>

<style scoped>
.num { font-size: 28px; font-weight: bold; color: #1989fa; }
</style>
