<template>
  <div class="admin-wide">
    <van-nav-bar title="学生管理" left-arrow @click-left="$router.back()" />
    <van-search v-model="keyword" placeholder="按姓名搜索" @search="load" @clear="load" />
    <div style="padding: 0 16px 12px;">
      <van-button type="primary" size="small" icon="plus" @click="openEdit(null)">新增学生</van-button>
    </div>
    <van-empty v-if="!loading && list.length === 0" description="暂无学生" />
    <van-cell v-for="s in list" :key="s.studentId" :title="s.name"
      :label="`${campusName(s.campusId)}${s.phone ? ' · ' + s.phone : ''}`">
      <template #value>
        <van-button size="small" @click="openEdit(s)">编辑</van-button>
        <van-button size="small" type="danger" style="margin-left: 6px;" @click="onRemove(s)">删除</van-button>
      </template>
    </van-cell>

    <van-dialog v-model:show="showEdit" :title="editing ? '编辑学生' : '新增学生'" show-cancel-button @confirm="onSave">
      <van-field v-model="form.name" label="姓名" placeholder="学生姓名" />
      <van-field v-model="campusLabel" label="校区" placeholder="请选择校区" readonly is-link @click="showPicker = true" />
      <van-field v-model="form.phone" label="电话" placeholder="选填" />
    </van-dialog>

    <van-popup v-model:show="showPicker" position="bottom" round>
      <van-picker :columns="campusOptions" @confirm="onPickCampus" @cancel="showPicker = false" />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { call } from '../../api'

const keyword = ref('')
const list = ref([])
const campuses = ref([])
const loading = ref(false)
const showEdit = ref(false)
const editing = ref(null)
const form = ref({ name: '', campusId: '', phone: '' })
const showPicker = ref(false)

const campusMap = computed(() => {
  const m = {}
  for (const c of campuses.value) m[c.campusId] = c.name
  return m
})
const campusOptions = computed(() => campuses.value.map(c => ({ text: c.name, value: c.campusId })))
const campusLabel = computed(() => campusMap.value[form.value.campusId] || '')

function campusName(id) {
  return campusMap.value[id] || '未知校区'
}

async function load() {
  loading.value = true
  try {
    const data = await call('baseData', { action: 'listStudents', keyword: keyword.value || undefined })
    list.value = data.list
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

async function loadCampuses() {
  try {
    const data = await call('baseData', { action: 'listCampuses' })
    campuses.value = data.list
  } catch (e) {
    showToast(e.message)
  }
}

function openEdit(s) {
  editing.value = s
  form.value = s ? { name: s.name, campusId: s.campusId, phone: s.phone } : { name: '', campusId: '', phone: '' }
  showEdit.value = true
}

function onPickCampus({ selectedOptions }) {
  form.value.campusId = selectedOptions[0].value
  showPicker.value = false
}

async function onSave() {
  if (!form.value.name.trim()) {
    showToast('请输入学生姓名')
    return
  }
  if (!form.value.campusId) {
    showToast('请选择校区')
    return
  }
  try {
    if (editing.value) {
      await call('baseData', { action: 'updateStudent', studentId: editing.value.studentId, ...form.value })
      showSuccessToast('已更新')
    } else {
      await call('baseData', { action: 'addStudent', ...form.value })
      showSuccessToast('已新增')
    }
    await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function onRemove(s) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定删除学生「${s.name}」吗？` })
  } catch {
    return
  }
  try {
    await call('baseData', { action: 'removeStudent', studentId: s.studentId })
    showSuccessToast('已删除')
    await load()
  } catch (e) {
    showToast(e.message)
  }
}

onMounted(() => {
  loadCampuses()
  load()
})
</script>
