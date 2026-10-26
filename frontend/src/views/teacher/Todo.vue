<template>
  <div class="todo-page">
    <van-nav-bar title="待确认排课" />
    <van-empty v-if="!loading && !list.length" description="暂无待确认排课" />

    <van-cell-group
      v-for="c in list"
      :key="c.courseId"
      inset
      class="course-card"
    >
      <div class="card-header">
        <span class="course-title">
          {{ c.type === 'trial' ? '体验课' : '正式课' }} · {{ c.studentName }}
        </span>
        <van-tag v-if="c.type === 'regular'" type="primary">共 {{ c.totalSessions }} 次</van-tag>
        <van-tag v-else type="warning">体验课</van-tag>
      </div>
      <div class="campus-name">校区：{{ c.sessions[0]?.campusName || '-' }}</div>
      <div class="sessions">
        <div
          v-for="(s, i) in visibleSessions(c)"
          :key="i"
          class="session-row"
        >
          {{ s.date }} {{ s.startTime }}-{{ s.endTime }}
        </div>
        <div
          v-if="c.sessions.length > 4"
          class="expand-link"
          @click="toggleExpand(c.courseId)"
        >
          {{ expanded.has(c.courseId) ? '收起' : `展开全部（${c.sessions.length} 次）` }}
        </div>
      </div>
      <div class="actions">
        <van-button size="small" type="success" :loading="acting === c.courseId" @click="onConfirm(c)">确认</van-button>
        <van-button size="small" type="danger" plain :loading="acting === c.courseId" @click="onReject(c)">拒绝</van-button>
      </div>
    </van-cell-group>

    <TeacherTabbar />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { call } from '../../api'
import TeacherTabbar from '../../components/TeacherTabbar.vue'

const list = ref([])
const loading = ref(true)
const acting = ref('')
const expanded = ref(new Set())

function visibleSessions(c) {
  if (expanded.value.has(c.courseId) || c.sessions.length <= 4) return c.sessions
  return c.sessions.slice(0, 4)
}

function toggleExpand(id) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

async function load() {
  loading.value = true
  try {
    const data = await call('course', { action: 'todoList' })
    list.value = data.list || []
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onConfirm(c) {
  try {
    await showConfirmDialog({
      title: '确认排课',
      message: `确认接受${c.type === 'trial' ? '体验课' : '正式课'}「${c.studentName}」的排课吗？`
    })
  } catch {
    return
  }
  acting.value = c.courseId
  try {
    await call('course', { action: 'confirm', courseId: c.courseId })
    showSuccessToast('已确认')
  } catch (e) {
    showToast(e.message)
  } finally {
    acting.value = ''
    await load()
  }
}

async function onReject(c) {
  try {
    await showConfirmDialog({
      title: '拒绝排课',
      message: `确定拒绝${c.type === 'trial' ? '体验课' : '正式课'}「${c.studentName}」的排课吗？`
    })
  } catch {
    return
  }
  acting.value = c.courseId
  try {
    await call('course', { action: 'reject', courseId: c.courseId })
    showSuccessToast('已拒绝')
  } catch (e) {
    showToast(e.message)
  } finally {
    acting.value = ''
    await load()
  }
}
</script>

<style scoped>
.todo-page { padding-bottom: 70px; }
.course-card { margin-top: 12px; padding: 12px 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.course-title { font-size: 16px; font-weight: 500; }
.campus-name { font-size: 13px; color: #646566; margin-top: 8px; }
.sessions { margin-top: 8px; }
.session-row { font-size: 13px; color: #323233; padding: 4px 0; }
.expand-link { font-size: 13px; color: #1989fa; padding: 4px 0; }
.actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px; }
</style>
