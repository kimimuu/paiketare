<template>
  <div class="change-password-page">
    <van-nav-bar title="修改密码" />
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="oldPassword" type="password" name="oldPassword" label="原密码" placeholder="请输入原密码"
          :rules="[{ required: true, message: '请输入原密码' }]" />
        <van-field v-model="newPassword" type="password" name="newPassword" label="新密码" placeholder="至少6位"
          :rules="[
            { required: true, message: '请输入新密码' },
            { validator: v => v.length >= 6, message: '新密码至少6位' }
          ]" />
        <van-field v-model="confirmPassword" type="password" name="confirmPassword" label="确认新密码" placeholder="再次输入新密码"
          :rules="[
            { required: true, message: '请再次输入新密码' },
            { validator: v => v === newPassword, message: '两次输入的密码不一致' }
          ]" />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">确认修改</van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../api'

const router = useRouter()
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    await call('auth', { action: 'changePassword', oldPassword: oldPassword.value, newPassword: newPassword.value })
    showSuccessToast('密码修改成功')
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user) {
      user.needChangePassword = false
      localStorage.setItem('user', JSON.stringify(user))
    }
    router.push(user && user.role === 'admin' ? '/admin/dashboard' : '/teacher/home')
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}
</script>
