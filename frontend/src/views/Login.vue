<template>
  <div class="login-page">
    <h1 class="title">排课系统</h1>
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="phone" name="phone" label="手机号" placeholder="请输入手机号"
          :rules="[{ required: true, message: '请输入手机号' }]" />
        <van-field v-model="password" type="password" name="password" label="密码" placeholder="请输入密码"
          :rules="[{ required: true, message: '请输入密码' }]" />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">登录</van-button>
      </div>
      <div class="register-link" @click="$router.push('/register')">老师注册</div>
      <div class="init-link" @click="showInit = true">初始化管理员（仅首次）</div>
    </van-form>

    <van-dialog v-model:show="showInit" title="初始化管理员" show-cancel-button @confirm="onInitAdmin">
      <van-field v-model="initForm.name" label="姓名" placeholder="管理员姓名" />
      <van-field v-model="initForm.phone" label="手机号" placeholder="登录账号" />
      <van-field v-model="initForm.password" type="password" label="密码" placeholder="至少6位" />
    </van-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../api'
import { useUserStore } from '../stores/user'

const router = useRouter()
const store = useUserStore()
const phone = ref('')
const password = ref('')
const loading = ref(false)
const showInit = ref(false)
const initForm = ref({ name: '', phone: '', password: '' })

async function onInitAdmin() {
  try {
    await call('auth', { action: 'initAdmin', ...initForm.value })
    showSuccessToast('管理员创建成功，请登录')
  } catch (e) {
    showToast(e.message)
  }
}

async function onSubmit() {
  loading.value = true
  try {
    const data = await call('auth', { action: 'login', phone: phone.value, password: password.value })
    store.setUser(data.user)
    localStorage.setItem('token', data.token)
    if (data.user.needChangePassword) {
      showToast('首次登录请修改密码')
    }
    router.push(data.user.role === 'admin' ? '/admin/dashboard' : '/teacher/home')
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { padding-top: 80px; }
.title { text-align: center; font-size: 28px; margin-bottom: 32px; }
.register-link { text-align: center; color: #1989fa; margin-top: 16px; }
.init-link { text-align: center; color: #969799; font-size: 12px; margin-top: 12px; }
</style>
