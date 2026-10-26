<template>
  <div>
    <van-nav-bar title="老师注册" left-arrow @click-left="$router.back()" />
    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="name" label="姓名" placeholder="真实姓名" :rules="[{ required: true, message: '请输入姓名' }]" />
        <van-field v-model="phone" label="手机号" placeholder="将作为登录账号" :rules="[{ required: true, message: '请输入手机号' }]" />
        <van-field v-model="password" type="password" label="密码" placeholder="至少6位" :rules="[{ required: true, message: '请设置密码' }]" />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">提交注册</van-button>
      </div>
    </van-form>
    <van-notice-bar text="注册需管理员审批通过后方可登录" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import { call } from '../api'

const router = useRouter()
const name = ref('')
const phone = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  if (password.value.length < 6) {
    showToast('密码至少6位')
    return
  }
  loading.value = true
  try {
    await call('auth', { action: 'register', name: name.value, phone: phone.value, password: password.value })
    showSuccessToast('已提交，等待管理员审批')
    router.push('/login')
  } catch (e) {
    showToast(e.message)
  } finally {
    loading.value = false
  }
}
</script>
