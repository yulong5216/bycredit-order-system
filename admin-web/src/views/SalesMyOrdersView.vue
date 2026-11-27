<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { unwrapList, normalizeOrder, money, dateText, statusMeta } from '../utils/format'
import { toast } from '../utils/feedback'
import BaseModal from '../components/BaseModal.vue'

const router = useRouter()
const loading = ref(true)
const orders = ref([])
const filter = ref('all') // all | m0 | pending | repaying
const noteModalOpen = ref(false)
const noteForm = ref({ orderId: null, note: '' })

const filtered = computed(() => {
  const list = orders.value
  if (filter.value === 'm0') return list.filter(o => o.hasM0)
  if (filter.value === 'pending') return list.filter(o => ['draft', 'pending_first', 'pending_final', 'pending_finance', 'pending_payout'].includes(o.status))
  if (filter.value === 'repaying') return list.filter(o => ['repaying', 'overdue', 'breach'].includes(o.status))
  return list
})

async function load() {
  loading.value = true
  try {
    const res = await api.listOrders({ size: 500 })
    orders.value = unwrapList(res).items.map(normalizeOrder)
  } catch (e) { toast(e.message, 'err') } finally { loading.value = false }
}

function openNote(order) {
  noteForm.value = { orderId: order.id, note: '' }
  noteModalOpen.value = true
}

async function submitNote() {
  const note = noteForm.value.note.trim()
  if (!note) return toast('请填写催收备注', 'err')
  try {
    await api.contactAttempt(noteForm.value.orderId, note)
    toast('已标记联系')
    noteModalOpen.value = false
    await load()
  } catch (e) { toast(e.message, 'err') }
}

function goDetail(id) {
  router.push(`/orders/${id}`)
}

const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'm0', label: 'M0 待办' },
  { key: 'pending', label: '待处理' },
  { key: 'repaying', label: '还款中' }
]
</script>

<template>
  <div class="sales-orders">
    <header class="so-top">
      <button class="so-back" @click="router.push('/sales/home')">‹ 返回</button>
      <div class="so-title">我的订单</div>
      <button class="so-refresh" @click="load" :disabled="loading">🔄</button>
    </header>

    <div class="so-tabs">
      <button v-for="t in filterTabs" :key="t.key" class="so-tab" :class="{ active: filter === t.key }" @click="filter = t.key">
        {{ t.label }}
        <span v-if="t.key === 'm0'" class="dot red" :class="{ 'dot-show': orders.some(o => o.hasM0) }"></span>
      </button>
    </div>

    <div v-if="loading" class="so-empty">加载中…</div>
    <div v-else-if="!filtered.length" class="so-empty">
      <div class="so-empty-mark">∅</div>
      <div>没有{{ filter === 'all' ? '' : filterTabs.find(t => t.key === filter)?.label }}订单</div>
    </div>

    <div v-else class="so-list">
      <div v-for="o in filtered" :key="o.id" class="so-card" :class="{ m0: o.hasM0 }">
        <div v-if="o.hasM0" class="so-m0-badge">M0 待办</div>
        <div class="so-card-head">
          <div class="so-order-no mono">{{ o.no }}</div>
          <span class="so-status" :class="statusMeta(o.status)[1]">{{ statusMeta(o.status)[0] }}</span>
        </div>
        <div class="so-card-body">
          <div class="so-customer">
            <div class="c-name">{{ o.customer.name || '—' }}</div>
            <div class="c-phone">{{ o.customer.phone || '—' }}</div>
          </div>
          <div class="so-device">
            <div>{{ o.device.model || '—' }} <span class="faint small">{{ o.device.capacity }}</span></div>
            <div class="money small">{{ money(o.plan.perPeriod) }} × {{ o.plan.periods }} 期</div>
          </div>
        </div>
        <div class="so-card-foot">
          <span class="so-date faint small">{{ dateText(o.createdAt) }}</span>
          <div class="so-actions">
            <button v-if="o.hasM0" class="so-btn primary" @click.stop="openNote(o)">✍️ 标记已联系</button>
            <button class="so-btn" @click="goDetail(o.id)">查看详情</button>
          </div>
        </div>
      </div>
    </div>

    <BaseModal v-if="noteModalOpen" title="M0 催收备注" :width="420" @close="noteModalOpen = false">
      <div class="modal-body">
        <div class="field">
          <label class="label">催收备注 <span class="req">*</span></label>
          <textarea v-model="noteForm.note" class="input" rows="4" placeholder="比如：11/28 电话联系客户，答应明天下午还款" maxlength="500"></textarea>
          <div class="faint small mt8">每次提交都会追加到该订单的催收记录里，可多次填写</div>
        </div>
      </div>
      <template #footer>
        <div class="modal-foot">
          <button class="btn ghost" @click="noteModalOpen = false">取消</button>
          <button class="btn primary" @click="submitNote" :disabled="!noteForm.note.trim()">提交</button>
        </div>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.sales-orders{min-height:100vh;background:#F5F7FB;padding-bottom:32px}
.so-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(170deg,#155EEF,#0B4BD6);color:#fff}
.so-back{background:rgba(255,255,255,.15);border:0;color:#fff;padding:6px 12px;border-radius:20px;font-size:13px;cursor:pointer}
.so-title{font-size:16px;font-weight:600}
.so-refresh{background:rgba(255,255,255,.15);border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px}
.so-tabs{display:flex;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #E5E9F2;overflow-x:auto}
.so-tab{position:relative;padding:8px 14px;border-radius:20px;border:1px solid #E5E9F2;background:#fff;font-size:13px;cursor:pointer;white-space:nowrap;color:#64748B}
.so-tab.active{background:#155EEF;border-color:#155EEF;color:#fff;font-weight:600}
.dot{position:absolute;top:6px;right:10px;width:8px;height:8px;border-radius:50%;display:none}
.dot.red{background:#D92D20}
.dot-show{display:block}
.so-empty{padding:80px 20px;text-align:center;color:#64748B;font-size:13px}
.so-empty-mark{font-size:36px;color:#94A3B8;margin-bottom:12px}
.so-list{padding:12px 16px;display:flex;flex-direction:column;gap:12px}
.so-card{position:relative;background:#fff;border-radius:14px;padding:16px;border:1px solid #E5E9F2;box-shadow:0 1px 3px rgba(15,27,45,.04)}
.so-card.m0{border-color:#D92D20;border-width:2px;background:linear-gradient(180deg,#FEF6F4,#fff)}
.so-m0-badge{position:absolute;top:-1px;right:14px;background:#D92D20;color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:0 0 8px 8px;letter-spacing:.5px}
.so-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.so-order-no{font-size:12.5px;color:#0F1B2D;font-weight:600}
.so-status{font-size:11px;padding:2px 8px;border-radius:999px;font-weight:500}
.so-status.green{background:#E7F6EF;color:#0E9F6E}
.so-status.blue{background:#EAF0FF;color:#155EEF}
.so-status.amber{background:#FEF3C7;color:#B45309}
.so-status.red{background:#FEE4E2;color:#D92D20}
.so-status.gray{background:#F1F5F9;color:#64748B}
.so-status.purple{background:#F3E8FF;color:#7E22CE}
.so-card-body{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}
.so-customer .c-name{font-weight:600;font-size:15px;color:#0F1B2D}
.so-customer .c-phone{font-size:12px;color:#64748B;margin-top:2px}
.so-device{text-align:right}
.so-device .money{color:#0F1B2D;font-weight:600}
.so-device .faint{color:#94A3B8}
.so-card-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #F1F5F9;padding-top:10px}
.so-actions{display:flex;gap:8px}
.so-btn{padding:6px 12px;border-radius:8px;border:1px solid #E5E9F2;background:#fff;font-size:12px;cursor:pointer;color:#64748B}
.so-btn.primary{background:#155EEF;border-color:#155EEF;color:#fff}
.so-btn.primary:hover{background:#0B4BD6}
</style>
