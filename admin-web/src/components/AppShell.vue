<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const props = defineProps({ title: String, group: { type: String, default: '业务办理' }, nav: { type: String, default: 'orders' } })
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const allNav = computed(() => {
  if (auth.role === 'sales') {
    return [
      { key: 'home', label: '首页', to: '/sales/home' },
      { key: 'my-orders', label: '我的订单', to: '/sales/my-orders' },
      { key: 'new', label: '新建录单', to: '/orders/new' },
      { key: 'pwd', label: '修改密码', to: '/settings/password' }
    ]
  }
  return [
    { group: '业务办理' },
    { key: 'orders', label: '订单池', to: '/orders' },
    { key: 'new', label: '新建录单', to: '/orders/new', show: auth.can('createOrder') },
    { key: 'first', label: '待初审', to: '/orders?tab=first', show: auth.can('reviewFirst') || auth.role === 'admin' },
    { key: 'final', label: '待终审', to: '/orders?tab=final', show: auth.can('reviewFinal') || auth.role === 'admin' },
    { key: 'finance', label: '财务审核', to: '/orders?tab=finance', show: auth.can('finance') || auth.role === 'admin' },
    { key: 'bills', label: '账单管理', to: '/bills', show: auth.can('viewBills') || auth.role === 'admin' },
    { group: '资料与合同' },
    { key: 'customers', label: '客户档案', to: '/customers', show: auth.role === 'admin' },
    { group: '运营与系统' },
    { key: 'stores', label: '门店管理', to: '/stores', show: auth.role === 'admin' },
    { key: 'teams', label: '团队管理', to: '/teams', show: auth.role === 'admin' },
    { key: 'users', label: '员工管理', to: '/users', show: auth.role === 'admin' }
  ]
})
const activeNav = computed(() => {
  const p = route.path
  const q = route.query.tab
  if (auth.role === 'sales') {
    if (p.startsWith('/sales/home')) return 'home'
    if (p.startsWith('/sales/my-orders')) return 'my-orders'
    if (p.startsWith('/orders/new')) return 'new'
    if (p.startsWith('/settings/password')) return 'pwd'
    return ''
  }
  if (p.startsWith('/orders/new')) return 'new'
  if (p.startsWith('/orders')) {
    if (q === 'first') return 'first'
    if (q === 'final') return 'final'
    if (q === 'finance') return 'finance'
    return 'orders'
  }
  if (p.startsWith('/bills')) return 'bills'
  if (p.startsWith('/customers')) return 'customers'
  if (p.startsWith('/stores')) return 'stores'
  if (p.startsWith('/teams')) return 'teams'
  if (p.startsWith('/users')) return 'users'
  return props.nav || ''
})
const crumb = computed(() => props.group || route.meta.group || '业务办理')

function logout() {
  auth.logout()
  router.replace('/login')
}
function expired(event) {
  if (!event.detail?.customer && route.name !== 'customer') router.replace('/login')
}
onMounted(() => window.addEventListener('auth-expired', expired))
onUnmounted(() => window.removeEventListener('auth-expired', expired))
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <RouterLink class="brand" to="/orders">
        <div class="brand-mark">BY</div>
        <div><div class="brand-name">BY Credit</div><div class="brand-sub">分期订单管理</div></div>
      </RouterLink>
      <nav class="nav">
        <template v-for="(item, index) in allNav" :key="item.group || item.key">
          <div v-if="item.group" class="nav-label">{{ item.group }}</div>
          <RouterLink v-else-if="item.show !== false" class="nav-item" :class="{ active: activeNav === item.key }" :to="item.to" :active-class="''">
            {{ item.label }}
          </RouterLink>
          <span v-else :key="`hidden-${index}`" class="hide" />
        </template>
      </nav>
      <div class="sidebar-foot">
        <div class="avatar">{{ auth.displayName.slice(0, 1) }}</div>
        <div><div class="who">{{ auth.displayName }}</div><div class="role">{{ auth.roleName }}</div></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="crumb">{{ crumb }} / <b>{{ title || route.meta.title }}</b></div>
        <div class="row">
          <RouterLink class="btn sm ghost" to="/customer">客户 H5</RouterLink>
          <button class="btn sm" type="button" @click="logout">退出登录</button>
        </div>
      </header>
      <slot />
    </main>
  </div>
</template>
