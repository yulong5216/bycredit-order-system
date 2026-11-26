<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import AppPagination from '../components/AppPagination.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { money, normalizeOrder, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const busy = ref(false)
const all = ref([])
const stores = ref([])
const selected = ref(new Set())
const state = reactive({ status: route.query.tab || 'all', q: route.query.q || '', store: route.query.store || '', from: '', to: '', urgent: false, page: 1, size: 10 })

const tabs = [
  ['all', '全部'], ['first', '待初审'], ['sign', '待客户签约'], ['final', '待终审'],
  ['toFinance', '待送财务'], ['finance', '待财务'], ['payout', '待放款'], ['repaying', '还款中'], ['rejected', '已驳回']
]
const groups = {
  first: ['pending_first'], sign: ['pending_customer_sign'], final: ['pending_final'], toFinance: ['approved_final'],
  finance: ['pending_finance'], payout: ['pending_payout'], repaying: ['repaying', 'overdue', 'breach'],
  rejected: ['rejected_first', 'rejected_final']
}
const title = computed(() => tabs.find(t => t[0] === state.status)?.[1] || '订单池')
const inGroup = (order, key) => key === 'all' || (groups[key] || []).includes(order.status)
const filtered = computed(() => {
  const q = state.q.trim().toLowerCase()
  return all.value.filter(o => {
    if (!inGroup(o, state.status)) return false
    if (state.store && String(o.plan.storeId || o.store.id) !== String(state.store)) return false
    if (state.urgent && !o.urgent) return false
    const submitted = String(o.submittedAt || o.createdAt || '').slice(0, 10)
    if (state.from && submitted < state.from) return false
    if (state.to && submitted > state.to) return false
    if (q) {
      const text = [o.no, o.customer.name, o.customer.phone, o.customer.idNo, o.device.imei, o.mdm.serial, o.plan.storeName, o.store.name].join(' ').toLowerCase()
      if (!text.includes(q)) return false
    }
    return true
  })
})
const pageRows = computed(() => filtered.value.slice((state.page - 1) * state.size, state.page * state.size))
const counts = computed(() => Object.fromEntries(tabs.map(([key]) => [key, all.value.filter(o => inGroup(o, key)).length])))
const selectedRows = computed(() => all.value.filter(o => selected.value.has(o.id)))
const financeSelected = computed(() => selectedRows.value.filter(o => o.status === 'approved_final'))
const allChecked = computed(() => pageRows.value.length > 0 && pageRows.value.every(o => selected.value.has(o.id)))
const kpis = computed(() => [
  ['待初审', counts.value.first, '核对资料 · 演示签约 · 登记 MDM'],
  ['待客户签约', counts.value.sign, '等待回填演示签约结果'],
  ['待终审', counts.value.final, '核对资料 / 放款 / MDM 信息'],
  ['待送财务', counts.value.toFinance, '终审通过后发送财务'],
  ['待放款', counts.value.payout, '财务通过，等待银行打款']
])

async function load() {
  loading.value = true
  try {
    const [ordersRes, storesRes] = await Promise.all([api.listOrders({ size: 1000 }), api.listStores({ size: 1000 })])
    all.value = unwrapList(ordersRes).items.map(normalizeOrder)
    stores.value = unwrapList(storesRes).items
    selected.value.clear()
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function setStatus(status) { state.status = status; state.page = 1; selected.value.clear() }
function search() { state.page = 1; selected.value.clear() }
function clearFilters() { Object.assign(state, { q: '', store: '', from: '', to: '', urgent: false, page: 1 }); selected.value.clear() }
function toggle(id, checked) { checked ? selected.value.add(id) : selected.value.delete(id) }
function toggleAll(checked) { pageRows.value.forEach(o => checked ? selected.value.add(o.id) : selected.value.delete(o.id)) }
async function sendFinance(ids) {
  if (!ids.length || busy.value) return
  busy.value = true
  try {
    await Promise.all(ids.map(id => api.sendFinance(id)))
    toast(`已发送 ${ids.length} 单至财务审核`)
    await load()
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
watch(() => filtered.value.length, () => {
  const pages = Math.max(1, Math.ceil(filtered.value.length / state.size))
  if (state.page > pages) state.page = pages
})
onMounted(() => {
  const stage = route.query.stage
  if (stage && groups[stage]) state.status = stage
  load()
})
</script>

<template>
  <AppShell :title="title === '全部' ? '订单池' : title">
    <div class="page">
      <div class="page-head">
        <div><div class="page-title">{{ title === '全部' ? '订单池' : title }}</div><div class="page-sub">{{ title }} · 共 {{ filtered.length }} 单</div></div>
        <div class="page-actions"><button class="btn" @click="load">刷新</button><RouterLink v-if="auth.can('createOrder')" class="btn primary" to="/orders/new">＋ 新建录单</RouterLink></div>
      </div>
      <div class="kpis five">
        <div v-for="kpi in kpis" :key="kpi[0]" class="kpi"><div class="kpi-label">{{ kpi[0] }}</div><div class="kpi-value">{{ kpi[1] }}<small>单</small></div><div class="kpi-foot">{{ kpi[2] }}</div></div>
      </div>
      <div class="card">
        <div class="tabs-wrap"><div class="tabs"><button v-for="tab in tabs" :key="tab[0]" class="tab" :class="{ active: state.status === tab[0] }" style="border-top:0;border-left:0;border-right:0;background:transparent" @click="setStatus(tab[0])">{{ tab[1] }}<span class="cnt">{{ counts[tab[0]] }}</span></button></div></div>
        <div class="toolbar">
          <div class="search"><input v-model="state.q" placeholder="订单号 / 姓名 / 电话 / IMEI / MDM" @keyup.enter="search"></div>
          <select v-model="state.store" class="select mini" @change="search"><option value="">全部门店</option><option v-for="store in stores" :key="store.id" :value="String(store.id)">{{ store.name }}</option></select>
          <input v-model="state.from" class="input mini filter-date" type="date" title="提交开始日期" @change="search"><span class="faint small">至</span>
          <input v-model="state.to" class="input mini filter-date" type="date" title="提交结束日期" @change="search">
          <button class="btn sm" @click="search">查询</button><button class="btn sm ghost" @click="clearFilters">清空</button><span class="grow-line"></span>
          <label class="row small muted" style="cursor:pointer"><input v-model="state.urgent" class="chk" type="checkbox" @change="search"> 只看加急</label>
        </div>
        <div class="batchbar" :class="{ show: selectedRows.length }">
          <span>已选 <b>{{ selectedRows.length }}</b> 单</span>
          <button v-if="auth.can('reviewFinal')" class="btn sm primary" :disabled="!financeSelected.length || busy" @click="sendFinance(financeSelected.map(o => o.id))">批量发送财务</button>
          <button class="btn sm ghost" @click="selected.clear()">取消勾选</button>
          <span class="mini-note">其中 {{ financeSelected.length }} 单可送财务，其余状态会被跳过</span>
        </div>
        <div class="table-wrap">
          <table class="table"><thead><tr><th class="chk-col"><input class="chk" type="checkbox" :checked="allChecked" @change="toggleAll($event.target.checked)"></th><th>订单号 / 提交时间</th><th>客户</th><th>机型 / MDM</th><th>门店 / 业务员</th><th class="t-right">分期方案</th><th>状态</th><th class="t-right">操作</th></tr></thead>
            <tbody>
              <tr v-if="loading"><td colspan="8"><div class="empty">加载中…</div></td></tr>
              <tr v-else-if="!pageRows.length"><td colspan="8"><div class="empty"><div class="empty-mark">∅</div>没有符合条件的订单，试试清空筛选条件</div></td></tr>
              <tr v-for="o in pageRows" v-else :key="o.id" :class="{ selected: selected.has(o.id) }" @click="router.push(`/orders/${o.id}`)">
                <td class="chk-col" @click.stop><input class="chk" type="checkbox" :checked="selected.has(o.id)" @change="toggle(o.id, $event.target.checked)"></td>
                <td><div class="mono strong">{{ o.no || o.id }} <span v-if="o.urgent" class="tag urgent">加急</span></div><div class="sub">{{ o.submittedAt || o.createdAt || '—' }} · {{ o.source || '业务员录单' }}</div></td>
                <td><div class="strong">{{ o.customer.name }}</div><div class="sub">{{ o.customer.phone }} · {{ String(o.customer.idNo || '').slice(0, 6) }}****</div></td>
                <td><div>{{ o.device.model }} <span class="faint">{{ o.device.capacity }}</span></div><div class="sub mono">{{ o.mdm.bound ? o.mdm.serial : 'MDM 未绑定' }}</div></td>
                <td><div>{{ o.plan.storeName || o.store.name }}</div><div class="sub">{{ o.plan.salesName || o.salesName || '—' }}</div></td>
                <td class="t-right"><div class="money strong">{{ money(o.plan.price) }}</div><div class="sub money">{{ o.plan.periods }} 期 × {{ money(o.plan.perPeriod) }}</div></td>
                <td><StatusPill :status="o.status" /></td>
                <td class="t-right" @click.stop><div class="table-actions"><button v-if="o.status === 'approved_final' && auth.can('reviewFinal')" class="btn sm primary" :disabled="busy" @click="sendFinance([o.id])">发送财务</button><RouterLink class="btn sm" :class="{ primary: ['pending_first','pending_final'].includes(o.status) }" :to="`/orders/${o.id}`">{{ o.status === 'pending_first' ? '初审' : o.status === 'pending_final' ? '终审' : '查看' }}</RouterLink></div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination :page="state.page" :size="state.size" :total="filtered.length" @change="state.page = $event" />
      </div>
    </div>
  </AppShell>
</template>
