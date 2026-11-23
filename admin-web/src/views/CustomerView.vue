<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { money, normalizeOrder, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const route = useRoute()
const token = ref(localStorage.getItem('bycredit_customer_token') || '')
const user = ref(readUser())
const orders = ref([])
const selectedId = ref('')
const bills = ref([])
const selectedPeriod = ref(0)
const view = ref('bill')
const loading = ref(false)
const billLoading = ref(false)
const loginBusy = ref(false)
const paymentBusy = ref(false)
const showDemo = ref(false)
const payment = ref(null)
const failureReason = ref('')
const resultMessage = ref('')
const form = reactive({ phone: localStorage.getItem('bycredit_customer_phone') || '', code: '' })

const selectedOrder = computed(() => orders.value.find(o => String(o.id) === String(selectedId.value)) || null)
const currentBill = computed(() => {
  if (!bills.value.length) return null
  if (selectedPeriod.value) {
    const selected = bills.value.find(b => Number(b.period) === Number(selectedPeriod.value))
    if (selected) return selected
  }
  return bills.value.find(b => ['Breach', 'Overdue'].includes(b.status))
    || bills.value.find(b => ['Pending', 'Deferred'].includes(b.status))
    || bills.value[bills.value.length - 1]
})
const paidAll = computed(() => bills.value.length > 0 && bills.value.every(b => ['Paid', 'Settled'].includes(b.status)))
const payable = computed(() => currentBill.value && ['Pending', 'Deferred', 'Overdue', 'Breach'].includes(currentBill.value.status) && ['repaying', 'overdue', 'breach'].includes(selectedOrder.value?.status))
const heroAmount = computed(() => {
  if (paidAll.value) return bills.value.reduce((sum, b) => sum + Number(b.amount || 0), 0)
  return currentBill.value?.amount ?? selectedOrder.value?.plan?.perPeriod ?? 0
})

function readUser() {
  try { return JSON.parse(localStorage.getItem('bycredit_customer_user') || 'null') } catch { return null }
}
function viDate(value, withTime = false) {
  if (!value) return '—'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.split('-').reverse().join('/')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('vi-VN', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date)
}
function billMeta(bill) {
  return {
    Pending: ['Chờ thanh toán', 'gray'], Paid: ['Đã thanh toán', 'green'], Deferred: ['Đã gia hạn', 'amber'],
    Overdue: ['Quá hạn', 'red'], Breach: ['Nợ xấu', 'red'], Settled: ['Đã tất toán', 'gray']
  }[bill?.status] || [bill?.status || 'Chưa cập nhật', 'gray']
}
function orderMeta(order) {
  return {
    draft: ['Bản nháp', 'gray'], pending_first: ['Chờ duyệt sơ bộ', 'amber'], rejected_first: ['Từ chối sơ bộ', 'red'],
    pending_customer_sign: ['Chờ ký', 'purple'], pending_final: ['Chờ duyệt cuối', 'blue'], rejected_final: ['Từ chối duyệt cuối', 'red'],
    approved_final: ['Đã duyệt', 'purple'], pending_finance: ['Chờ tài chính duyệt', 'amber'], pending_payout: ['Chờ giải ngân', 'blue'],
    repaying: ['Đang trả góp', 'green'], overdue: ['Quá hạn', 'red'], breach: ['Nợ xấu', 'red'], closed: ['Đã tất toán', 'gray'], cancelled: ['Đã hủy', 'gray']
  }[order?.status] || [order?.status || 'Chưa cập nhật', 'gray']
}
function paymentStatus(status) {
  return { pending: 'Đang chờ xử lý', succeeded: 'Thành công', failed: 'Thất bại', expired: 'Đã hết hạn', duplicate: 'Giao dịch trùng', exception: 'Cần kiểm tra' }[status] || status || 'Chưa cập nhật'
}
function channelText(channel) {
  return { bank_transfer: 'Chuyển khoản', cash: 'Tiền mặt', mock_qr: 'Thanh toán mô phỏng' }[channel] || channel || '—'
}
function resetPayment() {
  showDemo.value = false
  payment.value = null
  failureReason.value = ''
  resultMessage.value = ''
}
async function login() {
  const phone = form.phone.trim()
  if (!/^\d{9,15}$/.test(phone)) return toast('Vui lòng nhập số điện thoại hợp lệ.', 'err')
  if (!form.code.trim()) return toast('Vui lòng nhập mã xác minh.', 'err')
  loginBusy.value = true
  try {
    const data = await api.customerLogin({ phone, code: form.code.trim() })
    if (!data.token) throw new Error('Không nhận được thông tin đăng nhập. Vui lòng thử lại.')
    token.value = data.token
    user.value = data.user || { phone, name: '' }
    localStorage.setItem('bycredit_customer_token', data.token)
    localStorage.setItem('bycredit_customer_user', JSON.stringify(user.value))
    localStorage.setItem('bycredit_customer_phone', phone)
    form.code = ''
    view.value = 'bill'
    resetPayment()
    await loadOrders()
  } catch (error) { toast(error.message, 'err') } finally { loginBusy.value = false }
}
function logout() {
  token.value = ''
  user.value = null
  orders.value = []
  selectedId.value = ''
  bills.value = []
  localStorage.removeItem('bycredit_customer_token')
  localStorage.removeItem('bycredit_customer_user')
  resetPayment()
}
async function fetchBills() {
  const id = selectedId.value
  if (!id) { bills.value = []; return }
  billLoading.value = true
  bills.value = selectedOrder.value?.bills || []
  try {
    const data = await api.getBills(id, true)
    if (String(selectedId.value) === String(id)) bills.value = Array.isArray(data) ? data : (data.items || data.bills || [])
  } catch (error) { toast(error.message, 'err') } finally {
    if (String(selectedId.value) === String(id)) billLoading.value = false
  }
}
async function chooseOrder(id, preservePayment = false) {
  selectedId.value = id
  if (!preservePayment) { selectedPeriod.value = 0; resetPayment() }
  await fetchBills()
}
async function loadOrders(preferredId = '', preservePayment = false) {
  loading.value = true
  try {
    const data = await api.listOrders({ size: 100 }, true)
    orders.value = unwrapList(data).items.map(normalizeOrder)
    const requested = preferredId || route.query.order || selectedId.value
    const next = orders.value.find(o => String(o.id) === String(requested) || o.no === requested) || orders.value[0]
    selectedId.value = next?.id || ''
    if (next) await chooseOrder(next.id, preservePayment)
    else { bills.value = []; resetPayment() }
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function selectBill(bill) {
  selectedPeriod.value = Number(bill.period)
  resetPayment()
}
async function openMineOrder(id) {
  view.value = 'bill'
  await chooseOrder(id)
}
async function startPayment() {
  if (!currentBill.value || paymentBusy.value) return
  resetPayment()
  showDemo.value = true
  paymentBusy.value = true
  try {
    payment.value = await api.generatePayment({ orderId: selectedId.value, period: currentBill.value.period }, true)
  } catch (error) { showDemo.value = false; toast(error.message, 'err') } finally { paymentBusy.value = false }
}
async function mockResult(ok) {
  if (!payment.value || paymentBusy.value) return
  if (!ok && !failureReason.value.trim()) return toast('Vui lòng nhập lý do mô phỏng thất bại.', 'err')
  paymentBusy.value = true
  try {
    payment.value = await api.mockPayment(payment.value.requestNo, { ok, reason: ok ? '' : failureReason.value.trim() }, true)
    resultMessage.value = ok ? 'Mô phỏng thanh toán thành công. Hóa đơn đã được cập nhật.' : 'Đã ghi nhận kết quả mô phỏng thất bại. Không có khoản tiền thật nào phát sinh.'
    toast(resultMessage.value, ok ? 'ok' : 'err')
    if (ok) await loadOrders(selectedId.value, true)
  } catch (error) { toast(error.message, 'err') } finally { paymentBusy.value = false }
}
async function checkPayment() {
  if (!payment.value || paymentBusy.value) return
  paymentBusy.value = true
  try {
    payment.value = await api.paymentStatus(payment.value.requestNo, true)
    resultMessage.value = `Trạng thái yêu cầu: ${paymentStatus(payment.value.status)}.`
    if (payment.value.paid) await loadOrders(selectedId.value, true)
  } catch (error) { toast(error.message, 'err') } finally { paymentBusy.value = false }
}
function expired(event) {
  if (!event.detail?.customer) return
  logout()
  toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'err')
}
onMounted(() => {
  document.title = 'Hóa đơn trả góp · BY Credit'
  window.addEventListener('auth-expired', expired)
  if (token.value) loadOrders()
})
onUnmounted(() => window.removeEventListener('auth-expired', expired))
</script>

<template>
  <div v-if="!token" class="customer-login">
    <section class="customer-login-card">
      <div class="customer-login-logo">BY</div>
      <h1 style="font-size:23px;margin:0 0 8px">Hóa đơn trả góp</h1>
      <p class="small muted" style="line-height:1.7;margin:0 0 22px">Đăng nhập để xem đơn hàng và lịch thanh toán của bạn.</p>
      <form @submit.prevent="login">
        <div class="field"><label class="label" for="customer-phone">Số điện thoại</label><input id="customer-phone" v-model="form.phone" class="input" type="tel" inputmode="tel" autocomplete="tel" placeholder="Số điện thoại đã dùng khi mua hàng"></div>
        <div class="field"><label class="label" for="customer-code">Mã xác minh</label><input id="customer-code" v-model="form.code" class="input" inputmode="numeric" autocomplete="one-time-code" placeholder="Nhập mã xác minh"></div>
        <button class="btn primary block" style="height:44px" :disabled="loginBusy">{{ loginBusy ? 'Đang đăng nhập…' : 'Đăng nhập' }}</button>
      </form>
      <div class="alert info mt16"><span>DEMO</span><span>Tính năng thanh toán chỉ là mô phỏng, không kết nối ngân hàng và không trừ tiền thật.</span></div>
      <RouterLink class="btn ghost block mt12" to="/login">Dành cho nhân viên</RouterLink>
    </section>
  </div>

  <div v-else class="customer-shell">
    <div class="mp-stage"><div class="mp-app">
      <div class="mp-status"><span>9:41</span><span>BY Credit</span><span>●●●</span></div>
      <header class="mp-head"><div class="grow"><div class="m-title" style="font-size:15px">Hóa đơn trả góp</div><div class="m-sub">{{ user?.name || user?.phone || 'Khách hàng' }} · Theo dõi và thanh toán</div></div><button class="btn sm" type="button" @click="logout">Đổi TK</button></header>
      <main class="mp-body">
        <div v-if="loading" class="loading-block">Đang tải dữ liệu…</div>
        <template v-else-if="view === 'bill'">
          <div v-if="!selectedOrder" class="empty" style="padding-top:70px"><div class="empty-mark">∅</div><div>Chưa tìm thấy đơn hàng</div><div class="small faint mt8">Vui lòng kiểm tra số điện thoại hoặc liên hệ cửa hàng.</div><button class="btn primary mt16" @click="loadOrders()">Tải lại</button><button class="btn ghost block mt12" @click="logout">Đăng nhập bằng số khác</button></div>
          <template v-else>
            <select v-if="orders.length > 1" class="select mobile-order-select" :value="selectedId" @change="chooseOrder($event.target.value)"><option v-for="o in orders" :key="o.id" :value="o.id">{{ o.device.model }} · {{ o.no || o.id }}</option></select>
            <div class="mp-hero"><div class="mp-label">{{ paidAll ? 'Tổng số tiền đã thanh toán' : currentBill ? `Số tiền kỳ ${currentBill.period}` : 'Số tiền mỗi kỳ' }}</div><div class="mp-amount">{{ money(heroAmount) }}</div><div class="mp-hero-row"><span>{{ selectedOrder.customer.name }} · {{ selectedOrder.device.model }}</span><span>{{ paidAll ? 'Đã tất toán' : currentBill ? `Hạn ${viDate(currentBill.dueDate)}` : `${selectedOrder.plan.periods || 0} kỳ` }}</span></div></div>
            <div v-if="paidAll" class="mp-success"><div class="ok-mark">✓</div><div style="font-weight:600">Đã hoàn tất thanh toán</div><div class="small faint mt8">Cảm ơn bạn đã thanh toán đúng hạn.</div></div>
            <div v-else-if="currentBill && ['Paid', 'Settled'].includes(currentBill.status)" class="mp-success"><div class="ok-mark">✓</div><div style="font-weight:600">Kỳ này đã thanh toán</div><div class="small faint mt8">{{ viDate(currentBill.paidAt, true) }} · {{ channelText(currentBill.channel) }}</div></div>
            <template v-else-if="currentBill">
              <button v-if="payable" class="btn primary block" style="height:46px;font-size:15px;border-radius:11px;margin-top:12px" :disabled="paymentBusy" @click="startPayment">Thanh toán mô phỏng · {{ money(currentBill.amount) }}</button>
              <div v-if="payable" class="small faint t-center mt8">DEMO · Không phát sinh giao dịch thật</div>
              <div v-else class="alert info mt12"><span>Trạng thái</span><span>{{ orderMeta(selectedOrder)[0] }}. Kỳ thanh toán này hiện chưa thể tạo yêu cầu mô phỏng.</span></div>
            </template>
            <div v-else class="alert info mt12"><span>Đơn hàng</span><span>{{ orderMeta(selectedOrder)[0] }}. Lịch thanh toán sẽ hiển thị khi đã được tạo.</span></div>

            <section v-if="showDemo" class="demo-payment-card">
              <span class="demo-badge">THANH TOÁN MÔ PHỎNG</span>
              <div class="small muted mt12">Không có mã QR thật, không kết nối ngân hàng hoặc ví điện tử và không trừ tiền.</div>
              <div class="mp-amount" style="color:#0F1B2D;font-size:24px;margin-top:10px">{{ money(currentBill?.amount) }}</div>
              <div class="small faint">Kỳ {{ currentBill?.period }} · {{ viDate(currentBill?.dueDate) }}</div>
              <div v-if="paymentBusy && !payment" class="small muted mt16">Đang tạo yêu cầu mô phỏng…</div>
              <div v-else-if="payment" class="mt12"><div class="demo-request"><div class="small faint">Mã yêu cầu mô phỏng</div><div class="mono small">{{ payment.requestNo }}</div><div class="small faint mt8">Hiệu lực đến: {{ viDate(payment.expiresAt, true) }}</div><div class="small strong mt8">Trạng thái: {{ paymentStatus(payment.status) }}</div></div><div class="action-stack mt12"><button class="btn success" :disabled="paymentBusy || payment.status !== 'pending'" @click="mockResult(true)">Mô phỏng thanh toán thành công</button><button class="btn" :disabled="paymentBusy" @click="checkPayment">Kiểm tra trạng thái</button></div><div v-if="payment.status === 'pending'" class="field mt12"><label class="label" for="failure-reason">Lý do mô phỏng thất bại</label><input id="failure-reason" v-model="failureReason" class="input" placeholder="Ví dụ: khách hàng hủy thao tác"><button class="btn danger block mt8" :disabled="paymentBusy" @click="mockResult(false)">Mô phỏng thanh toán thất bại</button></div><div v-if="resultMessage" class="alert mt12" :class="payment.status === 'succeeded' ? 'ok' : 'info'">{{ resultMessage }}</div></div>
              <button class="btn ghost block mt12" :disabled="paymentBusy" @click="resetPayment">Quay lại hóa đơn</button>
            </section>

            <div class="row" style="margin:14px 0 6px"><div class="grow" style="font-size:12px;color:#64748B;font-weight:600">Tất cả các kỳ thanh toán</div><button class="btn sm ghost" :disabled="billLoading" @click="fetchBills">{{ billLoading ? 'Đang tải…' : 'Làm mới' }}</button></div>
            <button v-for="b in bills" :key="b.id || b.period" type="button" class="mp-bill" :class="{ selected: currentBill?.period === b.period }" style="border:0;width:100%;text-align:left;color:inherit" @click="selectBill(b)"><div><div class="p">Kỳ {{ b.period }}</div><div class="d">Hạn {{ viDate(b.dueDate) }}{{ b.note ? ` · ${b.note}` : '' }}</div></div><div><div class="amt">{{ money(b.amount) }}</div><div style="text-align:right;margin-top:3px"><span class="pill" :class="billMeta(b)[1]">{{ billMeta(b)[0] }}</span></div></div></button>
            <div v-if="!bills.length && !billLoading" class="empty">Chưa có lịch thanh toán</div>
            <div class="mp-foot-note">Thanh toán mô phỏng chỉ dùng để kiểm thử quy trình.<br>Nếu đã chuyển khoản nhưng dữ liệu chưa cập nhật, vui lòng liên hệ cửa hàng.</div>
          </template>
        </template>
        <template v-else>
          <div class="mp-bill" style="display:block;padding:16px"><div class="small faint">Số điện thoại đang đăng nhập</div><div style="font-size:20px;font-weight:650;margin-top:5px" class="mono">{{ user?.phone || form.phone }}</div><div class="small faint mt8">Chỉ các đơn hàng thuộc số điện thoại này được hiển thị.</div><button class="btn block mt12" @click="logout">Đăng xuất / đổi số điện thoại</button></div>
          <div class="row" style="margin:14px 0 6px"><div class="grow" style="font-size:12px;color:#64748B;font-weight:600">Đơn hàng của tôi ({{ orders.length }})</div><button class="btn sm ghost" @click="loadOrders(selectedId)">Làm mới</button></div>
          <button v-for="o in orders" :key="o.id" type="button" class="mp-bill" style="border:0;width:100%;text-align:left;color:inherit;cursor:pointer" @click="openMineOrder(o.id)"><div><div class="p">{{ o.device.model }} {{ o.device.capacity }}</div><div class="d mono">{{ o.no || o.id }}</div><div class="d">{{ o.plan.periods }} kỳ · {{ money(o.plan.perPeriod) }} / kỳ</div></div><div style="text-align:right"><span class="pill" :class="orderMeta(o)[1]">{{ orderMeta(o)[0] }}</span><div class="d mt8">Xem hóa đơn</div></div></button>
          <div v-if="!orders.length" class="alert warn"><span>Thông báo</span><span>Chưa tìm thấy đơn hàng thuộc số điện thoại này.</span></div>
        </template>
      </main>
      <nav class="m-tabbar"><button type="button" class="m-tab" :class="{ active: view === 'bill' }" style="border:0;background:transparent" @click="view = 'bill'"><i></i>Hóa đơn</button><button type="button" class="m-tab" :class="{ active: view === 'mine' }" style="border:0;background:transparent" @click="view = 'mine'"><i></i>Tài khoản</button></nav>
    </div></div>
  </div>
</template>
