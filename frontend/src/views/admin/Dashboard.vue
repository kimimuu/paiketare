<template>
  <div class="admin-wide">
    <van-nav-bar title="管理后台" />
    <van-grid :column-num="3" style="margin-top: 12px;">
      <van-grid-item text="今日课程"><template #icon><span class="num">{{ stats.todayCount }}</span></template></van-grid-item>
      <van-grid-item text="待确认"><template #icon><span class="num">{{ stats.pendingConfirmCount }}</span></template></van-grid-item>
      <van-grid-item text="待审批"><template #icon><span class="num">{{ stats.pendingApprovalCount }}</span></template></van-grid-item>
    </van-grid>
    <AdminMenu />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { call } from '../../api'
import AdminMenu from '../../components/AdminMenu.vue'

const stats = ref({ todayCount: '-', pendingConfirmCount: '-', pendingApprovalCount: '-' })

onMounted(async () => {
  try {
    const data = await call('course', { action: 'dashboardStats' })
    stats.value = data
  } catch (e) {
    showToast(e.message)
  }
})
</script>

<style scoped>
.num { font-size: 28px; font-weight: bold; color: #1989fa; }
</style>
