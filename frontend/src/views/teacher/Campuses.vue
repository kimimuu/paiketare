<template>
  <div class="campuses-page">
    <van-nav-bar title="我的校区" left-arrow @click-left="$router.back()" />
    <van-loading v-if="loading" class="loading" />
    <div v-else class="campus-grid">
      <div
        v-for="c in campuses"
        :key="c.campusId"
        class="campus-card"
        :class="{ active: selected.includes(c.campusId) }"
        @click="toggle(c.campusId)"
      >
        <div class="campus-name">
          {{ c.name }}
          <van-icon v-if="selected.includes(c.campusId)" name="success" class="check-icon" />
        </div>
        <div class="campus-address">{{ c.address }}</div>
      </div>
      <van-empty v-if="!campuses.length" description="暂无校区" />
    </div>
    <div class="footer">
      <van-button block type="primary" :loading="saving" @click="onSave">保存</van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../../api'

const router = useRouter()
const campuses = ref([])
const selected = ref([])
const loading = ref(true)
const saving = ref(false)

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

function toggle(id) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

async function onSave() {
  saving.value = true
  try {
    await call('availability', { action: 'setCampuses', campusIds: selected.value })
    showSuccessToast('保存成功')
    router.back()
  } catch (e) {
    showToast(e.message)
  } finally {
    saving.value = false
  }
}
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
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -1px 4px rgba(0, 0, 0, 0.05);
}
</style>
