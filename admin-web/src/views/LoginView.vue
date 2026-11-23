<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { toast } from '../utils/feedback'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ username: '', password: '' })
const busy = ref(false)

async function submit() {
  if (!form.username.trim() || !form.password) return toast('请输入账号和密码', 'err')
  busy.value = true
  try {
    await auth.login({ username: form.username.trim(), password: form.password })
    toast('登录成功')
    router.replace(route.query.redirect || '/orders')
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
</script>

<template>
  <div class="login-wrap">
    <section class="login-side">
      <div class="login-brand">
        <div class="login-mark">BY</div>
        <div><div style="color:#fff;font-weight:600;font-size:15px">BY Credit</div><div style="font-size:11px;color:#7C8DA8;margin-top:2px">分期订单管理系统</div></div>
      </div>
      <div>
        <div class="login-title">把赊销订单从录单到回款，<br>装进一套系统里。</div>
        <p class="login-desc">业务员移动录单与资料采集；初审核对资料、完成演示签约、登记 MDM 操作结果；终审核对；财务统一审批与打款；贷后管理账单。</p>
        <div class="login-points">
          <div class="lp"><span class="lp-dot"></span><div><b>流程清晰</b><span>录单 → 初审 → 演示签约 → 终审 → 财务 → 放款 → 还款</span></div></div>
          <div class="lp"><span class="lp-dot"></span><div><b>职责分离</b><span>按角色分配操作权限，每一步都保留可追溯记录</span></div></div>
          <div class="lp"><span class="lp-dot"></span><div><b>边界明确</b><span>支付与签约仅为演示，MDM 为准富后台人工操作后的结果登记</span></div></div>
        </div>
      </div>
      <div class="login-foot">BY Credit · 第一阶段业务系统</div>
    </section>
    <section class="login-panel">
      <h2>登录后台</h2>
      <div class="sub">使用系统分配的账号进入对应工作界面</div>
      <form @submit.prevent="submit">
        <div class="field"><label class="label" for="username">账号</label><input id="username" v-model="form.username" class="input" autocomplete="username" placeholder="请输入登录账号"></div>
        <div class="field"><label class="label" for="password">密码</label><input id="password" v-model="form.password" class="input" type="password" autocomplete="current-password" placeholder="请输入登录密码"></div>
        <button class="btn primary block" style="height:42px" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
      </form>
      <div class="divider" style="margin:22px 0"></div>
      <RouterLink class="btn block" to="/customer">客户账单 H5（越南语）</RouterLink>
      <div class="mini-note mt16">演示签约与演示支付不会创建真实合同或发起真实扣款；系统不包含第三方对接配置。</div>
    </section>
  </div>
</template>
