<template>
  <div class="campuses-page">
    <van-nav-bar title="我的校区" left-arrow @click-left="$router.back()" />
    <van-loading v-if="loading" class="loading" />
    <div v-else>
      <van-cell title="编辑时间和校区" is-link @click="$router.push('/teacher/availability')" />
      <div class="campus-grid">
        <div
          v-for="c in campuses"
          :key="c.campusId"
          class="campus-card"
          :class="{ active: selected.includes(c.campusId) }"
        >
          <div class="campus-name">
            {{ c.name }}
            <van-icon v-if="selected.includes(c.campusId)" name="success" class="check-icon" />
          </div>
          <div class="campus-address">{{ c.address }}</div>
        </div>
      </div>
      <div class="tip">校区修改请在「时间」页面统一提交审批</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { call } from '../../api'

const campuses = ref([])
const selected = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [all, mine] = await Promise.all([
      call('baseData', { action: 'listCampuses' }),
      call('availability', { action: 'listMy' })
    ])
    campuses.value = all.list || []
    selected.value = mine.campuses || []
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.campuses-page { padding-bottom: 80px; }
.loading { display: block; margin: 60px auto; }
.campus-grid { display: flex; flex-wrap: wrap; padding: 12px; gap: 12px; }
.campus-card {
  width: calc(50% - 6px);
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  background: #fff;
}
.campus-card.active { border-color: #1989fa; background: #ecf5ff; }
.campus-name { font-size: 15px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; }
.check-icon { color: #1989fa; }
.campus-address { font-size: 12px; color: #969799; margin-top: 4px; }
.tip { padding: 12px 16px; font-size: 13px; color: #969799; text-align: center; }
</style>
