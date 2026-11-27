<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { toast } from '../utils/feedback'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const busy = ref(false)
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })

async function submit() {
  if (!form.oldPassword) return toast('请输入当前密码', 'err')
  if (!form.newPassword || form.newPassword.length < 6) return toast('新密码至少 6 位', 'err')
  if (form.newPassword !== form.confirm) return toast('两次输入的新密码不一致', 'err')
  busy.value = true
  try {
    await api.changeMyPassword(form.oldPassword, form.newPassword)
    toast('密码已更新，请重新登录')
    auth.logout()
    router.replace('/login')
  } catch (e) { toast(e.message, 'err') } finally { busy.value = false }
}
</script>

<template>
  <div class="pwd-page">
    <header class="pwd-top">
      <button class="pwd-back" @click="router.back()">‹ 返回</button>
      <div class="pwd-title">修改密码</div>
      <div style="width:60px"></div>
    </header>

    <div class="pwd-card">
      <div class="pwd-hint">修改后需要重新登录，请牢记新密码。</div>
      <form @submit.prevent="submit">
        <div class="field">
          <label class="label">当前密码</label>
          <input v-model="form.oldPassword" class="input" type="password" placeholder="请输入当前密码" autocomplete="current-password">
        </div>
        <div class="field">
          <label class="label">新密码</label>
          <input v-model="form.newPassword" class="input" type="password" placeholder="至少 6 位" autocomplete="new-password">
        </div>
        <div class="field">
          <label class="label">确认新密码</label>
          <input v-model="form.confirm" class="input" type="password" placeholder="再次输入新密码" autocomplete="new-password">
        </div>
        <button class="btn primary block" style="height:42px;margin-top:16px" :disabled="busy">{{ busy ? '提交中…' : '确认修改' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.pwd-page{min-height:100vh;background:#F5F7FB}
.pwd-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(170deg,#155EEF,#0B4BD6);color:#fff}
.pwd-back{background:rgba(255,255,255,.15);border:0;color:#fff;padding:6px 12px;border-radius:20px;font-size:13px;cursor:pointer}
.pwd-title{font-size:16px;font-weight:600}
.pwd-card{margin:20px 16px;background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(15,27,45,.04);border:1px solid #E5E9F2}
.pwd-hint{font-size:12.5px;color:#64748B;margin-bottom:16px;padding:10px 12px;background:#F5F7FB;border-radius:8px;border:1px solid #E5E9F2}
.block{width:100%}
</style>
