<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import AppPagination from '../components/AppPagination.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../api'
import { dateText, money, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const router = useRouter()
const loading = ref(true)
const all = ref([])
const state = reactive({ q: '', status: 'all', page: 1, size: 12 })

function riskOf(customer) {
  if (customer.status) return customer.status
  if (['overdue', 'breach'].includes(customer.latestStatus)) return 'overdue'
  if (customer.latestStatus === 'repaying') return 'repaying'
  return 'normal'
}
function orderCount(customer) { return Number(customer.orders ?? customer.orderCount ?? 0) }
function totalAmount(customer) { return Number(customer.total ?? customer.totalAmount ?? customer.amount ?? 0) }
function modelsOf(customer) {
  if (Array.isArray(customer.models)) return customer.models
  return [customer.model || customer.device?.model].filter(Boolean)
}
function maskId(value) {
  const text = String(value || '')
  if (!text) return '—'
  return text.length <= 6 ? text : `${text.slice(0, 4)}****${text.slice(-4)}`
}
const filtered = computed(() => {
  const q = state.q.trim().toLowerCase()
  return all.value.filter(c => {
    if (state.status !== 'all' && riskOf(c) !== state.status) return false
    if (q && ![c.name, c.phone, c.idNo, c.address, c.storeName].join(' ').toLowerCase().includes(q)) return false
    return true
  })
})
const pageRows = computed(() => filtered.value.slice((state.page - 1) * state.size, state.page * state.size))
const total = computed(() => filtered.value.reduce((sum, c) => sum + totalAmount(c), 0))
const repeatCount = computed(() => all.value.filter(c => orderCount(c) > 1).length)
const overdueCount = computed(() => all.value.filter(c => riskOf(c) === 'overdue').length)
const orderTotal = computed(() => all.value.reduce((sum, c) => sum + orderCount(c), 0))

async function load() {
  loading.value = true
  try {
    const data = await api.listCustomers({ size: 1000 })
    all.value = unwrapList(data).items
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function riskMeta(customer) {
  return {
    normal: ['正常', 'green'], repaying: ['还款中', 'blue'], overdue: ['逾期', 'red']
  }[riskOf(customer)] || [riskOf(customer), 'gray']
}
function search() { state.page = 1 }
function clearFilters() { Object.assign(state, { q: '', status: 'all', page: 1 }) }
function viewOrders(customer) { router.push({ path: '/orders', query: { q: customer.phone || customer.name || '' } }) }
watch(() => filtered.value.length, () => {
  const pages = Math.max(1, Math.ceil(filtered.value.length / state.size))
  if (state.page > pages) state.page = pages
})
onMounted(load)
</script>

<template>
  <AppShell title="客户档案" group="资料与合同" nav="customers">
    <div class="page">
      <div class="page-head"><div><div class="page-title">客户档案</div><div class="page-sub">{{ { all: '全部状态', normal: '正常', repaying: '还款中', overdue: '逾期' }[state.status] }} · 共 {{ filtered.length }} 人 · 累计 {{ money(total) }}</div></div><button class="btn" @click="load">刷新</button></div>
      <div class="kpis"><div class="kpi"><div class="kpi-label">客户总数</div><div class="kpi-value">{{ all.length }}<small>人</small></div><div class="kpi-foot">按证件号去重</div></div><div class="kpi"><div class="kpi-label">复购客户数</div><div class="kpi-value">{{ repeatCount }}<small>人</small></div><div class="kpi-foot">下单 2 单及以上的客户</div></div><div class="kpi"><div class="kpi-label">逾期客户数</div><div class="kpi-value">{{ overdueCount }}<small>人</small></div><div class="kpi-foot">存在逾期或坏账订单</div></div><div class="kpi"><div class="kpi-label">累计合同金额</div><div class="kpi-value" style="font-size:19px">{{ money(all.reduce((sum, c) => sum + totalAmount(c), 0)) }}</div><div class="kpi-foot">覆盖 {{ orderTotal }} 份订单</div></div></div>
      <div class="card">
        <div class="toolbar"><div class="search"><input v-model="state.q" placeholder="姓名 / 电话 / 证件号 / 地址" @keyup.enter="search"></div><select v-model="state.status" class="select mini" @change="search"><option value="all">全部状态</option><option value="normal">正常</option><option value="repaying">还款中</option><option value="overdue">逾期</option></select><button class="btn sm" @click="search">查询</button><button class="btn sm ghost" @click="clearFilters">清空</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>客户</th><th>证件号</th><th>常居住址</th><th class="t-right">订单数</th><th class="t-right">累计金额</th><th>最近下单</th><th>设备</th><th>风险状态</th><th class="t-right">操作</th></tr></thead><tbody>
          <tr v-if="loading"><td colspan="9"><div class="empty">加载中…</div></td></tr><tr v-else-if="!pageRows.length"><td colspan="9"><div class="empty"><div class="empty-mark">∅</div>没有符合条件的客户，试试清空筛选条件</div></td></tr>
          <tr v-for="c in pageRows" v-else :key="c.id || c.idNo" @click="viewOrders(c)"><td><div class="strong">{{ c.name || '—' }}</div><div class="sub mono">{{ c.phone || '—' }}</div></td><td class="mono">{{ maskId(c.idNo) }}</td><td><div class="small" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="c.address">{{ c.address || c.storeName || '—' }}</div></td><td class="t-right num">{{ orderCount(c) }}</td><td class="t-right money strong">{{ money(totalAmount(c)) }}</td><td><div class="small">{{ dateText(c.lastAt || c.createdAt) }}</div><div v-if="c.latestOrderNo" class="sub mono">{{ c.latestOrderNo }}</div></td><td><div>{{ modelsOf(c)[0] || '—' }} <span v-if="modelsOf(c).length > 1" class="faint">+{{ modelsOf(c).length - 1 }}</span></div><div v-if="modelsOf(c).length > 1" class="sub">共 {{ modelsOf(c).length }} 台设备</div></td><td><StatusPill :label="riskMeta(c)[0]" :tone="riskMeta(c)[1]" /></td><td class="t-right" @click.stop><button class="btn sm" @click="viewOrders(c)">查看订单</button></td></tr>
        </tbody></table></div>
        <AppPagination :page="state.page" :size="state.size" :total="filtered.length" @change="state.page = $event" />
      </div>
    </div>
  </AppShell>
</template>
