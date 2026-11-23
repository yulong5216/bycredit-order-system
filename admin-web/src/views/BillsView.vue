<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import AppPagination from '../components/AppPagination.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { dateText, localDateTime, money, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const route = useRoute()
const auth = useAuthStore()
const loading = ref(true)
const busy = ref(false)
const rows = ref([])
const stores = ref([])
const modal = ref('')
const current = ref(null)
const payment = ref(null)
const paymentState = ref('')
const edit = reactive({})
const state = reactive({ q: route.query.q || '', status: 'all', month: '', store: '', page: 1, size: 12 })
const tabs = [['all', '全部账单'], ['Pending', '待还'], ['Paid', '已还'], ['Deferred', '已延期'], ['Overdue', '逾期'], ['Breach', '坏账'], ['Settled', '已结清']]
const total = ref(0)
const summary = ref({ due: 0, paid: 0, mockPaid: 0, overdue: 0, count: 0 })
const pageRows = computed(() => rows.value)
const modalTitle = computed(() => ({ pay: `代客登记还款 · 第 ${current.value?.period} 期`, defer: `办理延期 · 第 ${current.value?.period} 期`, breach: `标记逾期 / 坏账 · 第 ${current.value?.period} 期`, demo: '演示支付 · 不发起真实扣款' }[modal.value] || ''))

async function load() {
  loading.value = true
  try {
    const [billData, storeData] = await Promise.all([
      api.listBills({ page: state.page, size: state.size, q: state.q.trim(), status: state.status, month: state.month, store: state.store }),
      api.listStores({ size: 100 })
    ])
    rows.value = billData.items || []
    total.value = Number(billData.total || 0)
    summary.value = { due: 0, paid: 0, mockPaid: 0, overdue: 0, count: 0, ...(billData.summary || {}) }
    stores.value = unwrapList(storeData).items
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function search() { state.page = 1; return load() }
function setStatus(status) { state.status = status; return search() }
function clearFilters() { Object.assign(state, { q: '', status: 'all', month: '', store: '', page: 1 }); return load() }
function changePage(page) { state.page = page; return load() }
function channelText(channel) { return { bank_transfer: '银行转账', cash: '线下现金', mock_qr: '演示支付' }[channel] || channel || '—' }
function open(type, row) {
  current.value = row
  payment.value = null
  paymentState.value = ''
  Object.keys(edit).forEach(k => delete edit[k])
  if (type === 'pay') Object.assign(edit, { txnNo: '', channel: 'bank_transfer', paidAt: localDateTime(), note: '' })
  if (type === 'defer') Object.assign(edit, { days: 8, note: '' })
  if (type === 'breach') edit.note = ''
  modal.value = type
}
async function save() {
  if (!current.value || busy.value) return
  const { orderId, period } = current.value
  if (modal.value === 'pay') {
    if (!edit.txnNo?.trim()) return toast('请填写支付订单号', 'err')
    if (!edit.paidAt) return toast('请选择支付时间', 'err')
  } else if (!edit.note?.trim()) return toast('请填写原因', 'err')
  busy.value = true
  try {
    if (modal.value === 'pay') await api.payBill(orderId, period, { txnNo: edit.txnNo.trim(), channel: edit.channel, paidAt: edit.paidAt, note: edit.note?.trim() || '' })
    if (modal.value === 'defer') await api.deferBill(orderId, period, { days: Number(edit.days), note: edit.note.trim() })
    if (modal.value === 'breach') await api.breachBill(orderId, period, { note: edit.note.trim() })
    const action = modal.value
    modal.value = ''
    toast(action === 'pay' ? '还款已登记' : '账单操作已保存')
    await load()
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function generateDemo() {
  busy.value = true
  try {
    payment.value = await api.generatePayment({ orderId: current.value.orderId, period: current.value.period })
    paymentState.value = '待选择演示结果'
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function mockResult(ok) {
  if (!payment.value || busy.value) return
  if (!ok && !edit.reason?.trim()) return toast('模拟失败请填写原因', 'err')
  busy.value = true
  try {
    await api.mockPayment(payment.value.requestNo, { ok, reason: ok ? '' : edit.reason.trim() })
    paymentState.value = ok ? '演示支付成功，账单已销账' : '已模拟支付失败'
    toast(paymentState.value, ok ? 'ok' : 'err')
    await load()
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function checkPayment() {
  if (!payment.value) return
  busy.value = true
  try {
    const data = await api.paymentStatus(payment.value.requestNo)
    paymentState.value = `支付单状态：${data.status || data.payment?.status || '未知'}`
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <AppShell title="账单管理">
    <div class="page">
      <div class="page-head"><div><div class="page-title">账单管理</div><div class="page-sub">按订单 + 期次管理还款、延期、逾期与演示支付</div></div><div class="page-actions"><RouterLink class="btn" to="/customer">打开客户 H5</RouterLink><button class="btn primary" @click="load">刷新账单</button></div></div>
      <div class="kpis"><div class="kpi"><div class="kpi-label">真实待回款</div><div class="kpi-value" style="font-size:19px">{{ money(summary.due) }}</div><div class="kpi-foot">筛选范围内扣除真实回款后的余额</div></div><div class="kpi"><div class="kpi-label">真实已回款</div><div class="kpi-value" style="font-size:19px">{{ money(summary.paid) }}</div><div class="kpi-foot">银行转账与线下现金 · 演示回款 {{ money(summary.mockPaid) }} 不计入</div></div><div class="kpi"><div class="kpi-label">逾期金额</div><div class="kpi-value" style="font-size:19px">{{ money(summary.overdue) }}</div><div class="kpi-foot down">需优先跟进</div></div><div class="kpi"><div class="kpi-label">账单笔数</div><div class="kpi-value" style="font-size:19px">{{ summary.count }} 笔</div><div class="kpi-foot">按订单 + 期次拆分</div></div></div>
      <div class="card"><div class="tabs-wrap"><div class="tabs"><button v-for="tab in tabs" :key="tab[0]" class="tab" :class="{ active: state.status === tab[0] }" style="border-top:0;border-left:0;border-right:0;background:transparent" @click="setStatus(tab[0])">{{ tab[1] }}</button></div></div>
        <div class="toolbar"><div class="search"><input v-model="state.q" placeholder="搜索订单号 / 客户 / 电话" @keyup.enter="search"></div><input v-model="state.month" class="input mini" type="month" @change="search"><select v-model="state.store" class="select mini" @change="search"><option value="">全部门店</option><option v-for="store in stores" :key="store.id" :value="String(store.id)">{{ store.name }}</option></select><button class="btn sm" @click="search">查询</button><button class="btn sm ghost" @click="clearFilters">清空</button><span class="grow-line"></span><span class="faint small">Pending 待还 / Paid 已还 / Deferred 延期 / Breach 坏账</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>账单 / 订单</th><th>客户</th><th>门店 / 业务员</th><th>应还日</th><th class="t-right">应还金额</th><th class="t-right">真实 / 演示回款</th><th>状态</th><th>支付渠道</th><th>支付订单号</th><th>支付时间</th><th class="t-right">操作</th></tr></thead><tbody>
          <tr v-if="loading"><td colspan="11"><div class="empty">正在加载账单…</div></td></tr><tr v-else-if="!pageRows.length"><td colspan="11"><div class="empty"><div class="empty-mark">∅</div>没有符合条件的账单</div></td></tr>
          <tr v-for="r in pageRows" v-else :key="`${r.orderId}-${r.period}`" @click="$router.push(`/orders/${r.orderId}`)"><td><div class="strong">第 {{ r.period }} / {{ r.periods }} 期</div><div class="sub mono">{{ r.orderNo }}</div></td><td><div>{{ r.customer }}</div><div class="sub">{{ r.phone }} · {{ r.model }}</div></td><td><div>{{ r.storeName }}</div><div class="sub">{{ r.salesName }}</div></td><td class="mono t-nowrap">{{ String(r.dueDate).slice(0, 10) }}</td><td class="t-right money strong">{{ money(r.amount) }}</td><td class="t-right money"><div v-if="Number(r.realPaidAmount)">{{ money(r.realPaidAmount) }}</div><div v-if="Number(r.mockPaidAmount)" class="sub">演示 {{ money(r.mockPaidAmount) }}</div><span v-if="!Number(r.realPaidAmount) && !Number(r.mockPaidAmount)">—</span></td><td><StatusPill :status="r.status" bill /><div v-if="r.note" class="sub">{{ r.note }}</div></td><td>{{ channelText(r.channel) }}</td><td class="mono small">{{ r.txnNo || '—' }}</td><td class="small">{{ dateText(r.paidAt) }}</td><td class="t-right" @click.stop><div class="table-actions"><template v-if="['Pending','Deferred','Overdue','Breach'].includes(r.status)"><button v-if="auth.can('payBill')" class="btn sm" @click="open('demo', r)">演示支付</button><button v-if="auth.can('payBill')" class="btn sm primary" @click="open('pay', r)">代客登记</button></template><button v-if="r.status === 'Pending' && auth.can('deferBill')" class="btn sm ghost" @click="open('defer', r)">延期</button><button v-if="['Pending','Deferred'].includes(r.status) && auth.can('breachBill')" class="btn sm ghost" @click="open('breach', r)">标记坏账</button><span v-if="['Paid','Settled'].includes(r.status)" class="faint small">已完成</span></div></td></tr>
        </tbody></table></div><AppPagination :page="state.page" :size="state.size" :total="total" @change="changePage" />
      </div>
    </div>

    <BaseModal v-if="modal" :title="modalTitle" :busy="busy" @close="modal = ''">
      <div v-if="current" class="alert info mb12"><span>账单</span><span>{{ current.orderNo }} · 第 {{ current.period }} 期 · {{ money(current.amount) }}</span></div>
      <template v-if="modal === 'pay'"><div class="field"><div class="label">支付订单号<span class="req">*</span></div><input v-model="edit.txnNo" class="input mono" placeholder="银行流水号 / 转账参考号 / 现金收据号"></div><div class="form-grid"><div class="field"><div class="label">支付渠道<span class="req">*</span></div><select v-model="edit.channel" class="select"><option value="bank_transfer">银行转账</option><option value="cash">线下现金</option></select></div><div class="field"><div class="label">支付时间<span class="req">*</span></div><input v-model="edit.paidAt" class="input" type="datetime-local"></div></div><div class="field"><div class="label">登记备注</div><textarea v-model="edit.note" class="textarea"></textarea></div></template>
      <template v-else-if="modal === 'defer'"><div class="field"><div class="label">延期天数<span class="req">*</span></div><input v-model="edit.days" class="input" type="number" min="1" max="30"></div><div class="field"><div class="label">延期原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea" placeholder="请填写客户申请与审批依据"></textarea></div></template>
      <template v-else-if="modal === 'breach'"><div class="alert warn mb12">请确认已完成催收跟进，该操作会写入订单日志。</div><div class="field"><div class="label">逾期 / 坏账原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea"></textarea></div></template>
      <template v-else-if="modal === 'demo'">
        <div class="demo-panel"><div class="demo-icon">DEMO</div><div class="small muted">不生成收款二维码，不连接银行或钱包，不发生真实扣款。</div><div class="money-lg t-center">{{ money(current?.amount) }}</div><button v-if="!payment" class="btn primary block" :disabled="busy" @click="generateDemo">{{ busy ? '生成中…' : '生成演示支付单' }}</button><div v-else><div class="demo-request mt12"><div class="small faint">演示支付请求号</div><div class="mono small">{{ payment.requestNo }}</div><div class="small faint mt8">有效期至 {{ dateText(payment.expiresAt) }}</div></div><div class="action-stack mt12"><button class="btn success" :disabled="busy" @click="mockResult(true)">模拟支付成功</button><button class="btn" :disabled="busy" @click="checkPayment">查询支付单状态</button></div><div class="field mt12"><div class="label">模拟失败原因（选择失败时填写）</div><input v-model="edit.reason" class="input" placeholder="例如 客户取消演示支付"></div><button class="btn danger block" :disabled="busy" @click="mockResult(false)">模拟支付失败</button></div></div><div v-if="paymentState" class="alert info mt12">{{ paymentState }}</div>
      </template>
      <template #footer><button class="btn" :disabled="busy" @click="modal = ''">关闭</button><button v-if="modal !== 'demo'" class="btn" :class="modal === 'breach' ? 'danger' : 'primary'" :disabled="busy" @click="save">{{ busy ? '提交中…' : '确认' }}</button></template>
    </BaseModal>
  </AppShell>
</template>
