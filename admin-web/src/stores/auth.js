import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api'

const ROLE_NAMES = {
  admin: '管理员', sales: '业务员', manager: '门店店长', first: '初审专员', final: '终审专员',
  finance: '财务', aftercare: '贷后管理', collector: '催收专员', customer: '客户'
}

const PERMISSIONS = {
  createOrder: ['sales'], updateOrder: ['sales', 'manager', 'first'], reviewFirst: ['first'], reviewFinal: ['final'],
  finance: ['finance'], payBill: ['finance'], deferBill: ['finance'],
  breachBill: ['finance'], manageStores: [], editStore: ['manager'],
  viewBills: ['sales', 'manager', 'finance', 'aftercare', 'collector'],
  viewCustomers: ['first', 'final', 'aftercare', 'collector']
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('bycredit_token') || '')
  const user = ref(null)
  const ready = ref(false)
  try { user.value = JSON.parse(localStorage.getItem('bycredit_user') || 'null') } catch { user.value = null }

  const role = computed(() => user.value?.role || user.value?.type || '')
  const roleName = computed(() => ROLE_NAMES[role.value] || user.value?.roleName || '后台用户')
  const displayName = computed(() => user.value?.name || user.value?.displayName || user.value?.username || '用户')

  function can(permission) {
    // admin 默认有大部分权限，但 createOrder 仅限业务员（admin 不做录单，放小程序）
    if (role.value === 'admin') return permission !== 'createOrder'
    return (PERMISSIONS[permission] || []).includes(role.value)
  }

  function persist(data) {
    token.value = data.token
    user.value = data.user
    localStorage.setItem('bycredit_token', data.token)
    localStorage.setItem('bycredit_user', JSON.stringify(data.user || {}))
  }

  async function login(credentials) {
    const data = await api.login(credentials)
    persist(data)
    ready.value = true
    return data.user
  }

  async function fetchMe() {
    if (!token.value) { ready.value = true; return null }
    try {
      const data = await api.me()
      user.value = data.user || data
      localStorage.setItem('bycredit_user', JSON.stringify(user.value || {}))
      return user.value
    } finally { ready.value = true }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('bycredit_token')
    localStorage.removeItem('bycredit_user')
  }

  return { token, user, ready, role, roleName, displayName, can, login, fetchMe, logout }
})
