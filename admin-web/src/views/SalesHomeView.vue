<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'
import { unwrapList, normalizeOrder } from '../utils/format'
import { toast } from '../utils/feedback'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(true)
const orders = ref([])

const stats = computed(() => {
  const list = orders.value
  const today = new Date().toISOString().slice(0, 10)
  const monthPrefix = today.slice(0, 7)
  return {
    total: list.length,
    thisMonth: list.filter(o => (o.createdAt || '').slice(0, 7) === monthPrefix).length,
    pending: list.filter(o => ['draft', 'pending_first', 'pending_final'].includes(o.status)).length,
    m0: list.filter(o => o.hasM0).length
  }
})

async function load() {
  loading.value = true
  try {
    const res = await api.listOrders({ size: 500 })
    orders.value = unwrapList(res).items.map(normalizeOrder)
  } catch (e) { toast(e.message, 'err') } finally { loading.value = false }
}

function logout() {
  auth.logout()
  router.replace('/login')
}

onMounted(load)
</script>

<template>
  <div class="sales-home">
    <header class="sales-top">
      <div class="sales-top-left">
        <div class="sales-avatar">{{ auth.displayName.slice(0, 1) }}</div>
        <div>
          <div class="sales-greet">你好，{{ auth.displayName }}</div>
          <div class="sales-sub">BY Credit · 业务员工作台</div>
        </div>
      </div>
      <button class="icon-btn" @click="logout" title="退出登录">↩</button>
    </header>

    <section class="sales-hero">
      <div class="sales-hero-title">今天也要加油 💪</div>
      <div class="sales-hero-sub">把订单搞定，把 M0 联系了</div>
    </section>

    <section class="sales-stats">
      <div class="s-card"><div class="s-num">{{ stats.total }}</div><div class="s-lbl">全部订单</div></div>
      <div class="s-card"><div class="s-num">{{ stats.thisMonth }}</div><div class="s-lbl">本月录单</div></div>
      <div class="s-card"><div class="s-num warn">{{ stats.pending }}</div><div class="s-lbl">待处理</div></div>
      <div class="s-card danger" v-if="stats.m0 > 0"><div class="s-num">{{ stats.m0 }}</div><div class="s-lbl">M0 待办</div></div>
      <div class="s-card" v-else><div class="s-num good">0</div><div class="s-lbl">M0 待办</div></div>
    </section>

    <section class="sales-actions">
      <RouterLink class="action-tile primary" to="/orders/new">
        <div class="act-icon">📱</div>
        <div class="act-body"><div class="act-title">录单</div><div class="act-sub">新建手机分期订单</div></div>
        <div class="act-arrow">›</div>
      </RouterLink>
      <RouterLink class="action-tile" to="/sales/my-orders">
        <div class="act-icon">📋</div>
        <div class="act-body"><div class="act-title">我的订单</div><div class="act-sub">查看 + M0 催收</div></div>
        <div class="act-arrow">›</div>
      </RouterLink>
      <RouterLink class="action-tile" to="/settings/password">
        <div class="act-icon">⚙️</div>
        <div class="act-body"><div class="act-title">修改密码</div><div class="act-sub">定期更换更安全</div></div>
        <div class="act-arrow">›</div>
      </RouterLink>
    </section>

    <div v-if="loading" class="sales-loading">加载中…</div>
    <div class="sales-foot">— BY Credit —</div>
  </div>
</template>

<style scoped>
.sales-home{min-height:100vh;background:linear-gradient(170deg,#155EEF 0%,#0B4BD6 25%,#F5F7FB 55%);padding:0 16px 32px}
.sales-top{display:flex;align-items:center;justify-content:space-between;padding:16px 4px 0}
.sales-top-left{display:flex;align-items:center;gap:12px}
.sales-avatar{width:40px;height:40px;border-radius:50%;background:#fff;color:#155EEF;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}
.sales-greet{color:#fff;font-weight:600;font-size:15px}
.sales-sub{color:rgba(255,255,255,.7);font-size:12px;margin-top:2px}
.icon-btn{background:rgba(255,255,255,.15);border:0;color:#fff;width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer}
.sales-hero{padding:24px 4px 8px}
.sales-hero-title{color:#fff;font-size:22px;font-weight:700}
.sales-hero-sub{color:rgba(255,255,255,.75);font-size:13px;margin-top:4px}
.sales-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}
.s-card{background:#fff;border-radius:14px;padding:16px 14px;box-shadow:0 2px 10px rgba(15,27,45,.06)}
.s-num{font-size:22px;font-weight:700;color:#0F1B2D;font-variant-numeric:tabular-nums}
.s-num.warn{color:#B45309}
.s-num.good{color:#0E9F6E}
.s-lbl{font-size:12px;color:#64748B;margin-top:4px}
.s-card.danger{border-left:3px solid #D92D20}
.sales-actions{display:flex;flex-direction:column;gap:10px;margin-top:24px}
.action-tile{display:flex;align-items:center;gap:14px;background:#fff;border-radius:14px;padding:16px;box-shadow:0 2px 10px rgba(15,27,45,.06);cursor:pointer;border:1px solid #E5E9F2;color:inherit}
.action-tile.primary{background:linear-gradient(135deg,#2F7BFF,#155EEF);color:#fff;border-color:transparent}
.action-tile.primary .act-sub{color:rgba(255,255,255,.8)}
.act-icon{width:44px;height:44px;border-radius:12px;background:#F5F7FB;display:flex;align-items:center;justify-content:center;font-size:22px}
.action-tile.primary .act-icon{background:rgba(255,255,255,.2)}
.act-body{flex:1}
.act-title{font-size:16px;font-weight:600}
.act-sub{font-size:12px;color:#64748B;margin-top:2px}
.act-arrow{font-size:22px;color:#94A3B8}
.sales-loading{text-align:center;padding:40px;color:#64748B;font-size:13px}
.sales-foot{text-align:center;color:#94A3B8;font-size:11px;margin-top:32px}
</style>
