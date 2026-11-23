<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import AppPagination from '../components/AppPagination.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusPill from '../components/StatusPill.vue'
import { api, saveBlob } from '../api'
import { money, normalizeOrder, payoutAmount, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const loading = ref(true)
const busy = ref(false)
const all = ref([])
const selected = ref(new Set())
const payoutOrder = ref(null)
const payoutRef = ref('')
const approveNote = ref('')
const state = reactive({ tab: 'review', q: '', store: '', urgent: false, page: 1, size: 10 })
const tabs = [['review', '待审核', ['pending_finance']], ['payout', '待放款', ['pending_payout']], ['paid', '已放款 / 还款中', ['repaying', 'overdue', 'breach', 'closed']], ['all', '全部', null]]
const stores = computed(() => [...new Map(all.value.map(o => [String(o.plan.storeId || o.store.id), o.plan.storeName || o.store.name]).filter(x => x[0] && x[0] !== 'undefined')).entries()])
const currentTab = computed(() => tabs.find(t => t[0] === state.tab) || tabs[0])
const filtered = computed(() => {
  const q = state.q.trim().toLowerCase()
  return all.value.filter(o => {
    if (currentTab.value[2] && !currentTab.value[2].includes(o.status)) return false
    if (state.store && String(o.plan.storeId || o.store.id) !== state.store) return false
    if (state.urgent && !o.urgent) return false
    if (q && ![o.no, o.customer.name, o.customer.idNo, o.customer.phone, o.plan.storeName, o.store.name, o.device.imei].join(' ').toLowerCase().includes(q)) return false
    return true
  })
})
const pageRows = computed(() => filtered.value.slice((state.page - 1) * state.size, state.page * state.size))
const selectedRows = computed(() => all.value.filter(o => selected.value.has(o.id)))
const selectedAmount = computed(() => selectedRows.value.reduce((s, o) => s + payoutAmount(o), 0))
const review = computed(() => all.value.filter(o => o.status === 'pending_finance'))
const payout = computed(() => all.value.filter(o => o.status === 'pending_payout'))
const totalPayout = computed(() => filtered.value.filter(o => o.status === 'pending_payout').reduce((s, o) => s + payoutAmount(o), 0))
const allChecked = computed(() => pageRows.value.length > 0 && pageRows.value.every(o => selected.value.has(o.id)))

async function load() {
  loading.value = true
  try { const data = await api.financeOrders({ size: 1000 }); all.value = unwrapList(data).items.map(normalizeOrder); selected.value.clear() }
  catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function setTab(tab) { state.tab = tab; state.page = 1; selected.value.clear() }
function clearFilters() { Object.assign(state, { q: '', store: '', urgent: false, page: 1 }) }
function toggle(id, checked) { checked ? selected.value.add(id) : selected.value.delete(id) }
function toggleAll(checked) { pageRows.value.forEach(o => checked ? selected.value.add(o.id) : selected.value.delete(o.id)) }
async function approve(orders) {
  const list = orders.filter(o => o.status === 'pending_finance')
  if (!list.length || busy.value) return toast('仅待财务审核单据可审批', 'err')
  busy.value = true
  try { await Promise.all(list.map(o => api.financeApprove(o.id, approveNote.value))); toast(`已通过 ${list.length} 单财务审批`); approveNote.value = ''; await load() }
  catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function confirmPayout() {
  if (!payoutRef.value.trim()) return toast('请填写银行回单号', 'err')
  busy.value = true
  try { await api.payout(payoutOrder.value.id, payoutRef.value.trim()); payoutOrder.value = null; payoutRef.value = ''; toast('已标记放款，订单进入还款中'); await load() }
  catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function exportData() {
  busy.value = true
  try {
    const data = await api.financeExport({ orderIds: selectedRows.value.map(o => o.id).join(','), q: state.q, store: state.store })
    saveBlob(data, `财务明细_${new Date().toISOString().slice(0, 10)}.csv`)
    toast('财务明细已导出')
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <AppShell title="财务审核" group="财务">
    <div class="page">
      <div class="page-head"><div><div class="page-title">财务审核</div><div class="page-sub">{{ currentTab[1] }} · 共 {{ filtered.length }} 单 · 待放款合计 {{ money(totalPayout) }}</div></div><div class="page-actions"><button class="btn" @click="load">刷新</button><button class="btn primary" :disabled="busy" @click="exportData">导出财务明细</button></div></div>
      <div class="kpis"><div class="kpi"><div class="kpi-label">待财务审核</div><div class="kpi-value">{{ review.length }}<small>单</small></div><div class="kpi-foot">合计 {{ money(review.reduce((s,o) => s + payoutAmount(o), 0)) }}</div></div><div class="kpi"><div class="kpi-label">待放款</div><div class="kpi-value">{{ payout.length }}<small>单</small></div><div class="kpi-foot">合计 {{ money(payout.reduce((s,o) => s + payoutAmount(o), 0)) }}</div></div><div class="kpi"><div class="kpi-label">已放款 / 还款中</div><div class="kpi-value">{{ all.filter(o => ['repaying','overdue','breach','closed'].includes(o.status)).length }}<small>单</small></div><div class="kpi-foot">放款后自动生成账单</div></div><div class="kpi"><div class="kpi-label">加急单据数</div><div class="kpi-value">{{ all.filter(o => o.urgent && ['pending_finance','pending_payout'].includes(o.status)).length }}<small>单</small></div><div class="kpi-foot down">待审核 / 待放款中的加急单</div></div></div>
      <div class="card"><div class="tabs-wrap"><div class="tabs"><button v-for="tab in tabs" :key="tab[0]" class="tab" :class="{ active: state.tab === tab[0] }" style="border-top:0;border-left:0;border-right:0;background:transparent" @click="setTab(tab[0])">{{ tab[1] }}<span class="cnt">{{ tab[2] ? all.filter(o => tab[2].includes(o.status)).length : all.length }}</span></button></div></div>
        <div class="toolbar"><div class="search"><input v-model="state.q" placeholder="订单号 / 客户 / 证件号 / 门店 / IMEI"></div><select v-model="state.store" class="select mini"><option value="">全部门店</option><option v-for="store in stores" :key="store[0]" :value="store[0]">{{ store[1] }}</option></select><button class="btn sm" @click="state.page = 1">查询</button><button class="btn sm ghost" @click="clearFilters">清空</button><span class="grow-line"></span><label class="row small muted"><input v-model="state.urgent" class="chk" type="checkbox"> 只看加急</label></div>
        <div class="batchbar" :class="{ show: selectedRows.length }"><span>已选 <b>{{ selectedRows.length }}</b> 单</span><span>合计放款金额 <b class="money">{{ money(selectedAmount) }}</b></span><input v-model="approveNote" class="input mini" placeholder="审批备注（选填）"><button class="btn sm primary" :disabled="busy || !selectedRows.some(o => o.status === 'pending_finance')" @click="approve(selectedRows)">批量审批通过</button><button class="btn sm ghost" @click="selected.clear()">取消勾选</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th class="chk-col"><input class="chk" type="checkbox" :checked="allChecked" @change="toggleAll($event.target.checked)"></th><th>订单号</th><th>客户</th><th>门店 / 业务员录入</th><th>收款账号对比</th><th>机型</th><th class="t-right">放款金额</th><th class="t-right">已回款</th><th>状态</th><th class="t-right">操作</th></tr></thead><tbody>
          <tr v-if="loading"><td colspan="10"><div class="empty">加载中…</div></td></tr><tr v-else-if="!pageRows.length"><td colspan="10"><div class="empty"><div class="empty-mark">∅</div>没有符合条件的单据</div></td></tr>
          <tr v-for="o in pageRows" v-else :key="o.id" :class="{ selected: selected.has(o.id) }" @click="$router.push(`/orders/${o.id}`)"><td class="chk-col" @click.stop><input class="chk" type="checkbox" :checked="selected.has(o.id)" @change="toggle(o.id, $event.target.checked)"></td><td><div class="mono strong">{{ o.no }} <span v-if="o.urgent" class="tag urgent">加急</span></div><div class="sub">{{ o.submittedAt }}</div></td><td><div class="strong">{{ o.customer.name }}</div><div class="sub">{{ o.customer.phone }}</div></td><td><div>{{ o.plan.storeName || o.store.name }}</div><div class="sub">{{ o.payee.name || '未填写' }}</div></td><td><div class="mono">{{ o.payee.account || '—' }}</div><div class="sub" :class="String(o.payee.account || '') === String(o.store?.payee?.account || '') ? '' : 'down'">{{ String(o.payee.account || '') === String(o.store?.payee?.account || '') ? '与门店默认一致' : `门店默认：${o.store?.payee?.account || '未录入'}` }}</div></td><td><div>{{ o.device.model }} {{ o.device.capacity }}</div><div class="sub">{{ o.plan.periods }} 期 × {{ money(o.plan.perPeriod) }}</div></td><td class="t-right money strong">{{ money(payoutAmount(o)) }}</td><td class="t-right money">{{ money(o.bills.reduce((s,b) => s + Number(b.realPaidAmount || 0), 0)) }}</td><td><StatusPill :status="o.status" /></td><td class="t-right" @click.stop><div class="table-actions"><button v-if="o.status === 'pending_finance'" class="btn sm primary" :disabled="busy" @click="approve([o])">审批通过</button><button v-if="o.status === 'pending_payout'" class="btn sm success" @click="payoutOrder = o">标记已放款</button><RouterLink class="btn sm ghost" :to="`/orders/${o.id}`">查看</RouterLink></div></td></tr>
        </tbody></table></div><div class="total-bar"><div><div class="lbl">当前筛选 · 待放款合计</div><div class="val">{{ money(totalPayout) }}</div></div><div class="small muted t-right">银行打款在线下完成，系统只汇总并登记回单</div></div><AppPagination :page="state.page" :size="state.size" :total="filtered.length" @change="state.page = $event" />
      </div>
    </div>
    <BaseModal v-if="payoutOrder" title="标记已放款" :busy="busy" @close="payoutOrder = null"><div class="mini-note mb12">{{ payoutOrder.no }} · {{ payoutOrder.customer.name }} · {{ payoutOrder.plan.storeName || payoutOrder.store.name }}</div><div class="kv two mb12"><div class="kv-k">业务员录入</div><div class="kv-v">{{ payoutOrder.payee.name }}</div><div class="kv-k">门店默认</div><div class="kv-v">{{ payoutOrder.store?.payee?.holder || payoutOrder.store?.payee?.name || '—' }}</div><div class="kv-k">放款金额</div><div class="kv-v money">{{ money(payoutAmount(payoutOrder)) }}</div><div class="kv-k">收款账号</div><div class="kv-v mono">{{ payoutOrder.payee.account }}<br><span class="small muted">门店默认：{{ payoutOrder.store?.payee?.account || '未录入' }}</span></div><div class="kv-k">开户行</div><div class="kv-v">{{ payoutOrder.store?.payee?.bank || '—' }}</div></div><div class="field"><div class="label">银行回单号<span class="req">*</span></div><input v-model="payoutRef" class="input mono" placeholder="如 VCB-20261121-0101"><div class="hint">打款在银行软件内完成，本系统只做汇总与状态回写。</div></div><template #footer><button class="btn" @click="payoutOrder = null">取消</button><button class="btn primary" :disabled="busy" @click="confirmPayout">确认已放款</button></template></BaseModal>
  </AppShell>
</template>
