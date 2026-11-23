import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/', redirect: '/orders' },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/orders', name: 'orders', component: () => import('../views/OrdersView.vue'), meta: { title: '订单池', group: '业务办理' } },
  { path: '/orders/new', name: 'new-order', component: () => import('../views/NewOrderView.vue'), meta: { title: '新建录单', permission: 'createOrder' } },
  { path: '/orders/:id', name: 'order-detail', component: () => import('../views/OrderDetailView.vue'), meta: { title: '订单详情', group: '业务办理' } },
  { path: '/bills', name: 'bills', component: () => import('../views/BillsView.vue'), meta: { title: '账单管理', group: '业务办理', permission: 'viewBills' } },
  { path: '/finance', name: 'finance', component: () => import('../views/FinanceView.vue'), meta: { title: '财务审核', group: '财务', permission: 'finance' } },
  { path: '/stores', name: 'stores', component: () => import('../views/StoresView.vue'), meta: { title: '门店管理', group: '运营与系统' } },
  { path: '/customers', name: 'customers', component: () => import('../views/CustomersView.vue'), meta: { title: '客户档案', group: '资料与合同', permission: 'viewCustomers' } },
  { path: '/customer', name: 'customer', component: () => import('../views/CustomerView.vue'), meta: { public: true } },
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
  if (to.meta.permission && !auth.can(to.meta.permission)) return { name: 'orders' }
  document.title = `${to.meta.title || '订单管理'} · BY Credit`
  return true
})

export default router
