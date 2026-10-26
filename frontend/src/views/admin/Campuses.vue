<template>
  <div class="admin-wide">
    <van-nav-bar title="校区管理" left-arrow @click-left="$router.back()" />
    <div style="padding: 12px 16px; display: flex; gap: 12px;">
      <van-button type="primary" size="small" icon="plus" @click="openEdit(null)">新增校区</van-button>
      <van-button size="small" icon="orders-o" @click="showImport = true">批量导入预置校区</van-button>
    </div>
    <van-empty v-if="!loading && list.length === 0" description="暂无校区" />
    <van-cell v-for="c in list" :key="c.campusId" :title="c.name" :label="c.address || '未填写地址'">
      <template #value>
        <van-button size="small" @click="openEdit(c)">编辑</van-button>
        <van-button size="small" type="danger" style="margin-left: 6px;" @click="onRemove(c)">删除</van-button>
      </template>
    </van-cell>

    <van-dialog v-model:show="showEdit" :title="editing ? '编辑校区' : '新增校区'" show-cancel-button @confirm="onSave">
      <van-field v-model="form.name" label="名称" placeholder="校区名称"
        :rules="[{ required: true, message: '请输入校区名称' }]" />
      <van-field v-model="form.address" label="地址" placeholder="选填" />
    </van-dialog>

    <van-dialog v-model:show="showImport" title="批量导入校区" show-cancel-button @confirm="onImport">
      <van-field v-model="importText" type="textarea" rows="8" placeholder="每行一个校区名" />
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { call } from '../../api'

const list = ref([])
const loading = ref(false)
const showEdit = ref(false)
const editing = ref(null)
const form = ref({ name: '', address: '' })
const showImport = ref(false)
const importText = ref('')

async function load() {
  loading.value = true
  try {
    const data = await call('baseData', { action: 'listCampuses' })
    list.value = data.list
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}

function openEdit(c) {
  editing.value = c
  form.value = c ? { name: c.name, address: c.address } : { name: '', address: '' }
  showEdit.value = true
}

async function onSave() {
  if (!form.value.name.trim()) {
    showToast('请输入校区名称')
    return
  }
  try {
    if (editing.value) {
      await call('baseData', { action: 'updateCampus', campusId: editing.value.campusId, ...form.value })
      showSuccessToast('已更新')
    } else {
      await call('baseData', { action: 'addCampus', ...form.value })
      showSuccessToast('已新增')
    }
    await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function onRemove(c) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `确定删除校区「${c.name}」吗？` })
  } catch {
    return
  }
  try {
    await call('baseData', { action: 'removeCampus', campusId: c.campusId })
    showSuccessToast('已删除')
    await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function onImport() {
  const names = importText.value.split('\n').map(l => l.trim()).filter(Boolean)
  if (names.length === 0) {
    showToast('请输入校区名称，每行一个')
    return
  }
  try {
    const data = await call('baseData', { action: 'importCampuses', names })
    showSuccessToast(`新增 ${data.created} 个校区`)
    importText.value = ''
    await load()
  } catch (e) {
    showToast(e.message)
  }
}

onMounted(load)
</script>
