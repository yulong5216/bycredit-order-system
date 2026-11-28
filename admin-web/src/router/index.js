import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/', redirect: '/orders' },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },

  // 业务员专属
  { path: '/sales/home', name: 'sales-home', component: () => import('../views/SalesHomeView.vue'), meta: { title: '业务员首页', role: 'sales' } },
  { path: '/sales/my-orders', name: 'sales-my-orders', component: () => import('../views/SalesMyOrdersView.vue'), meta: { title: '我的订单', role: 'sales' } },

  // 设置
  { path: '/settings/password', name: 'password-change', component: () => import('../views/PasswordChangeView.vue'), meta: { title: '修改密码' } },

  // 常规管理后台
  { path: '/orders', name: 'orders', component: () => import('../views/OrdersView.vue'), meta: { title: '订单池', group: '业务办理' } },
  { path: '/orders/new', name: 'new-order', component: () => import('../views/NewOrderView.vue'), meta: { title: '新建录单', permission: 'createOrder' } },
  { path: '/orders/:id', name: 'order-detail', component: () => import('../views/OrderDetailView.vue'), meta: { title: '订单详情', group: '业务办理' } },
  { path: '/bills', name: 'bills', component: () => import('../views/BillsView.vue'), meta: { title: '账单管理', group: '业务办理', permission: 'viewBills' } },
  { path: '/finance', name: 'finance', component: () => import('../views/FinanceView.vue'), meta: { title: '财务审核', group: '财务', permission: 'finance' } },
  { path: '/stores', name: 'stores', component: () => import('../views/StoresView.vue'), meta: { title: '门店管理', group: '运营与系统' } },
  { path: '/teams', name: 'teams', component: () => import('../views/TeamsView.vue'), meta: { title: '团队管理', group: '运营与系统', permission: 'manageStores' } },
  { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { title: '员工管理', group: '运营与系统', permission: 'manageStores' } },
  { path: '/customers', name: 'customers', component: () => import('../views/CustomersView.vue'), meta: { title: '客户档案', group: '资料与合同', permission: 'viewCustomers' } },
  { path: '/customer', name: 'customer', component: () => import('../views/CustomerView.vue'), meta: { public: true } },
  { path: '/collection/accounts', name: 'collection-accounts', component: () => import('../views/CollectionAccountsView.vue'), meta: { title: '收款账号配置', group: '财务', role: ['admin', 'finance', 'manager'] } },
  { path: '/:pathMatch(.*)*', redirect: '/orders' }
]

const router = createRouter({
  history: createWebHistory('/order-web/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async to => {
  if (to.meta.public) return true
  const auth = useAuthStore()
  if (!auth.token) return { name: 'login', query: { redirect: to.fullPath } }
  if (!auth.user && !auth.ready) {
    try { await auth.fetchMe() } catch { auth.logout(); return { name: 'login' } }
  }
  if (to.meta.role) {
    const roles = Array.isArray(to.meta.role) ? to.meta.role : [to.meta.role]
    if (!roles.includes(auth.role)) return { name: 'orders' }
  }
  if (to.meta.permission && !auth.can(to.meta.permission)) return { name: 'orders' }
  document.title = `${to.meta.title || '订单管理'} · BY Credit`
  return true
})

// 登录后默认跳转：sales → /sales/home，其他 → /orders
export function defaultRedirectForRole(role) {
  if (role === 'sales') return '/sales/home'
  return '/orders'
}

export default router
