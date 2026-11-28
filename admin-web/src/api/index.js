import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/order-api',
  timeout: 20000
})

http.interceptors.request.use(config => {
  const key = config.customer ? 'bycredit_customer_token' : 'bycredit_token'
  const token = localStorage.getItem(key)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  response => response.data,
  error => {
    const config = error.config || {}
    if (error.response?.status === 401) {
      const key = config.customer ? 'bycredit_customer_token' : 'bycredit_token'
      localStorage.removeItem(key)
      window.dispatchEvent(new CustomEvent('auth-expired', { detail: { customer: !!config.customer } }))
    }
    const data = error.response?.data
    const message = data?.message || data?.error?.message || data?.error || error.message || '网络请求失败'
    const err = new Error(typeof message === 'string' ? message : '请求失败，请稍后重试')
    err.status = error.response?.status
    err.data = data
    return Promise.reject(err)
  }
)

const orderAction = (id, action, data = {}) => http.post(`/api/orders/${id}/${action}`, data)

export const api = {
  login: data => http.post('/api/auth/login', data),
  me: () => http.get('/api/auth/me'),
  customerLogin: data => http.post('/api/auth/customer-login', data, { customer: true }),

  listOrders: (params = {}, customer = false) => http.get(customer ? '/api/customer/orders' : '/api/orders', { params, customer }),
  getOrder: (id, customer = false) => http.get(customer ? `/api/customer/orders/${id}` : `/api/orders/${id}`, { customer }),
  createOrder: data => http.post('/api/orders', data),
  updateOrder: (id, data) => http.put(`/api/orders/${id}`, data),
  uploadDoc: (id, key, file) => {
    const data = new FormData()
    data.append('file', file)
    return http.post(`/api/orders/${id}/docs/${key}`, data)
  },
  downloadDoc: (id, key) => http.get(`/api/orders/${id}/docs/${key}/content`, { responseType: 'blob' }),
  submitOrder: id => orderAction(id, 'submit'),
  firstReview: (id, data) => orderAction(id, 'first-review', data),
  finalReview: (id, data) => orderAction(id, 'final-review', data),
  sendFinance: id => orderAction(id, 'send-finance'),
  cancelOrder: (id, note) => orderAction(id, 'cancel', { note }),
  addNote: (id, note) => orderAction(id, 'notes', { note }),
  contactAttempt: (id, note) => orderAction(id, 'contact-attempt', { note }),
  updatePlan: (id, data) => http.put(`/api/orders/${id}/plan`, data),
  updateDueDate: (id, firstDueDate, note) => http.put(`/api/orders/${id}/due-date`, { firstDueDate, note }),
  bindMdm: (id, data) => http.post(`/api/orders/${id}/mdm/bind`, data),
  unbindMdm: (id, note) => http.post(`/api/orders/${id}/mdm/unbind`, { note }),
  startEsign: id => http.post(`/api/orders/${id}/esign/start`, {}),
  simulateEsign: (id, data) => http.post(`/api/orders/${id}/esign/simulate`, data),
  listBills: (params = {}) => http.get('/api/bills', { params }),
  getBills: (id, customer = false) => http.get(customer ? `/api/customer/orders/${id}/bills` : `/api/orders/${id}/bills`, { customer }),
  payBill: (id, period, data) => http.post(`/api/orders/${id}/bills/${period}/pay`, data),
  deferBill: (id, period, data) => http.post(`/api/orders/${id}/bills/${period}/defer`, data),
  breachBill: (id, period, data) => http.post(`/api/orders/${id}/bills/${period}/breach`, data),

  generatePayment: (data, customer = false) => http.post('/api/payment/generate', data, { customer }),
  mockPayment: (requestNo, data, customer = false) => http.post(`/api/payment/${requestNo}/mock-result`, data, { customer }),
  paymentStatus: (requestNo, customer = false) => http.get('/api/payment/status', { params: { requestNo }, customer }),

  financeOrders: (params = {}) => http.get('/api/finance/orders', { params }),
  financeApprove: (orderId, note = '') => http.post(`/api/finance/${orderId}/approve`, { note }),
  payout: (orderId, ref) => http.post(`/api/finance/${orderId}/payout`, { ref }),
  financeExport: (params = {}) => http.get('/api/finance/export', { params, responseType: 'blob' }),

  listStores: (params = {}) => http.get('/api/stores', { params }),
  createStore: data => http.post('/api/stores', data),
  updateStore: (id, data) => http.put(`/api/stores/${id}`, data),
  uploadStorePayeeQr: (id, file) => {
    const data = new FormData()
    data.append('file', file)
    return http.post(`/api/stores/${id}/payee-qr`, data)
  },
  downloadStorePayeeQr: id => http.get(`/api/stores/${id}/payee-qr/content`, { responseType: 'blob' }),
  rateStore: (id, data) => http.post(`/api/stores/${id}/rating`, data),
  storeStatus: (id, data) => http.post(`/api/stores/${id}/status`, data),

  listTeams: () => http.get('/api/teams'),
  createTeam: data => http.post('/api/teams', data),
  updateTeam: (id, data) => http.patch(`/api/teams/${id}`, data),

  listUsers: (params = {}) => http.get('/api/users', { params }),
  createUser: data => http.post('/api/users', data),
  updateUser: (id, data) => http.patch(`/api/users/${id}`, data),
  resetUserPassword: (id, data) => http.post(`/api/users/${id}/reset-password`, data),
  changeMyPassword: (oldPassword, newPassword) => http.put('/api/users/me/password', { oldPassword, newPassword }),
  listCustomers: (params = {}) => http.get('/api/customers', { params }),
  orderLogs: id => http.get(`/api/logs/order/${id}`),

  // 收款账号管理
  listPayeeAccounts: () => http.get('/api/collection/accounts'),
  createPayeeAccount: data => http.post('/api/collection/accounts', data),
  updatePayeeAccount: (id, data) => http.put(`/api/collection/accounts/${id}`, data),
  deletePayeeAccount: id => http.delete(`/api/collection/accounts/${id}`),
  switchPayeeAccount: (payeeAccountId, date, remark) => http.post('/api/collection/switch', { payeeAccountId, date, remark }),
  currentPayeeAccount: () => http.get('/api/collection/current'),
  payeeAccountHistory: (params = {}) => http.get('/api/collection/configs', { params })
}

export function saveBlob(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data])
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
