<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { dateText, money, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const auth = useAuthStore()
const loading = ref(true)
const busy = ref(false)
const all = ref([])
const modal = ref('')
const current = ref(null)
const edit = reactive({})
const formQrUrl = ref('')
const detailQrUrl = ref('')
const state = reactive({ q: '', city: '', type: 'all', status: 'all', rating: 'all' })
const cities = computed(() => [...new Set(all.value.map(s => s.city).filter(Boolean))])
const filtered = computed(() => {
  const q = state.q.trim().toLowerCase()
  return all.value.filter(s => {
    if (state.city && s.city !== state.city) return false
    if (state.type !== 'all' && (s.type || 'partner') !== state.type) return false
    if (state.status !== 'all' && s.status !== state.status) return false
    if (state.rating !== 'all' && (s.rating || 'A') !== state.rating) return false
    if (q && ![s.code, s.id, s.name, s.city, s.contact, s.phone].join(' ').toLowerCase().includes(q)) return false
    return true
  })
})
const normalCount = computed(() => all.value.filter(s => s.status === 'active').length)
const modalTitle = computed(() => ({ detail: `门店详情 · ${current.value?.name || ''}`, form: current.value ? `编辑门店 · ${current.value.name}` : '新增门店', rating: `修改评级 · ${current.value?.name || ''}`, status: `${current.value?.status === 'active' ? '冻结' : '恢复'}门店 · ${current.value?.name || ''}` }[modal.value] || ''))

async function load() {
  loading.value = true
  try {
    const data = await api.listStores({ size: 100 })
    all.value = unwrapList(data).items
    if (auth.role === 'manager' && auth.user?.storeId) all.value = all.value.filter(s => String(s.id) === String(auth.user.storeId))
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
function canEdit(store) { return auth.role === 'admin' || (auth.can('editStore') && String(store.id) === String(auth.user?.storeId)) }
function ratingTone(rating) { return { A: 'green', B: 'blue', C: 'amber', D: 'red' }[rating || 'A'] }
function typeText(type) { return { partner: '合作店铺', own: '自有店铺' }[type] || type || '合作店铺' }
function statusText(status) { return status === 'active' ? '正常' : status === 'frozen' ? '冻结' : status }
function agreementText(value) { return { pending: '待签署', active: '已签署', expiring: '待续签', not_required: '无需签署' }[value] || value || '待签署' }
function payeeName(store) { return store?.payee?.name || store?.payee?.holder || '—' }
function clearEdit() { Object.keys(edit).forEach(k => delete edit[k]) }
function revokeQr(url) { if (url) URL.revokeObjectURL(url) }
async function loadFormQrPreview(storeId) {
  try {
    const blob = await api.downloadStorePayeeQr(storeId)
    revokeQr(formQrUrl.value)
    formQrUrl.value = URL.createObjectURL(blob)
  } catch { formQrUrl.value = '' }
}
async function loadDetailQr(store) {
  try {
    const blob = await api.downloadStorePayeeQr(store.id)
    revokeQr(detailQrUrl.value)
    detailQrUrl.value = URL.createObjectURL(blob)
  } catch { detailQrUrl.value = '' }
}
function payeeQrChanged(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return toast('请上传二维码图片', 'err')
  revokeQr(formQrUrl.value)
  edit.payeeQrFile = file
  formQrUrl.value = URL.createObjectURL(file)
}
function open(type, store = null) {
  revokeQr(formQrUrl.value); formQrUrl.value = ''
  revokeQr(detailQrUrl.value); detailQrUrl.value = ''
  current.value = store
  clearEdit()
  if (type === 'form') {
    edit.payeeQrFile = null
    Object.assign(edit, store ? JSON.parse(JSON.stringify({ ...store, payee: { name: store.payee?.name || store.payee?.holder || '', account: store.payee?.account || '', bank: store.payee?.bank || '' } })) : { code: '', name: '', type: 'partner', city: '', address: '', contact: '', phone: '', agreement: 'pending', payee: { name: '', account: '', bank: '' } })
    if (store?.payee?.qr?.storageName) loadFormQrPreview(store.id)
  }
  if (type === 'rating') Object.assign(edit, { rating: store.rating || 'A', note: '' })
  if (type === 'status') Object.assign(edit, { status: store.status === 'active' ? 'frozen' : 'active', note: '' })
  if (type === 'detail' && store?.payee?.qr?.storageName) loadDetailQr(store)
  modal.value = type
}
async function save() {
  if (busy.value) return
  if (modal.value === 'form') {
    if (!current.value && !edit.code?.trim()) return toast('请填写门店编码', 'err')
    if (!edit.name?.trim()) return toast('请填写门店名称', 'err')
    const payload = { code: edit.code?.trim().toUpperCase(), name: edit.name.trim(), type: edit.type, city: edit.city || '', address: edit.address || '', contact: edit.contact || '', phone: edit.phone || '', agreement: edit.agreement, payee: { name: edit.payee.name || '', account: edit.payee.account || '', bank: edit.payee.bank || '' } }
    busy.value = true
    try {
      let storeId = current.value?.id
      if (current.value) await api.updateStore(current.value.id, payload)
      else {
        const created = await api.createStore(payload)
        storeId = created?.id || created?._id
      }
      if (storeId && edit.payeeQrFile) await api.uploadStorePayeeQr(storeId, edit.payeeQrFile)
      modal.value = ''
      toast(current.value ? '门店资料已保存' : '门店已新增')
      await load()
    } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
    return
  }
  if (!edit.note?.trim()) return toast('操作原因必填', 'err')
  busy.value = true
  try {
    if (modal.value === 'rating') await api.rateStore(current.value.id, { rating: edit.rating, note: edit.note.trim() })
    if (modal.value === 'status') await api.storeStatus(current.value.id, { status: edit.status, note: edit.note.trim() })
    modal.value = ''
    toast('门店信息已更新')
    await load()
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
function clearFilters() { Object.assign(state, { q: '', city: '', type: 'all', status: 'all', rating: 'all' }) }
onMounted(load)
</script>

<template>
  <AppShell title="门店管理" group="运营与系统" nav="stores">
    <div class="page">
      <div class="page-head"><div><div class="page-title">门店管理</div><div class="page-sub">门店台账 · 共 {{ all.length }} 家 · 当前显示 {{ filtered.length }} 家</div></div><button v-if="auth.can('manageStores')" class="btn primary" @click="open('form')">＋ 新增门店</button></div>
      <div class="kpis"><div class="kpi"><div class="kpi-label">门店总数</div><div class="kpi-value">{{ all.length }}<small>家</small></div><div class="kpi-foot">合作店铺 {{ all.filter(s => s.type !== 'own').length }} 家 · 自有店铺 {{ all.filter(s => s.type === 'own').length }} 家</div></div><div class="kpi"><div class="kpi-label">正常门店</div><div class="kpi-value">{{ normalCount }}<small>家</small></div><div class="kpi-foot">可录入新单并按流程送财务</div></div><div class="kpi"><div class="kpi-label">冻结门店</div><div class="kpi-value">{{ all.length - normalCount }}<small>家</small></div><div class="kpi-foot">不可录新单，在贷继续还款</div></div><div class="kpi"><div class="kpi-label">黑名单门店</div><div class="kpi-value">{{ all.filter(s => s.rating === 'D').length }}<small>家</small></div><div class="kpi-foot">D 级黑名单 · B / C 影响放款比例</div></div></div>
      <div class="card"><div class="toolbar"><div class="search"><input v-model="state.q" placeholder="门店编号 / 名称 / 城市 / 联系人 / 电话"></div><select v-model="state.city" class="select mini"><option value="">全部城市</option><option v-for="city in cities" :key="city">{{ city }}</option></select><select v-model="state.type" class="select mini"><option value="all">全部类型</option><option value="partner">合作店铺</option><option value="own">自有店铺</option></select><select v-model="state.status" class="select mini"><option value="all">全部状态</option><option value="active">正常</option><option value="frozen">冻结</option></select><select v-model="state.rating" class="select mini"><option value="all">全部评级</option><option>A</option><option>B</option><option>C</option><option>D</option></select><button class="btn sm">查询</button><button class="btn sm ghost" @click="clearFilters">清空</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>门店编号</th><th>门店名称 / 城市</th><th>类型</th><th>地址</th><th>联系人 / 电话</th><th>收款信息</th><th>评级</th><th>状态</th><th class="t-right">进件量 / 待处理</th><th class="t-right">累计放款</th><th class="t-right">操作</th></tr></thead><tbody>
          <tr v-if="loading"><td colspan="11"><div class="empty">加载中…</div></td></tr><tr v-else-if="!filtered.length"><td colspan="11"><div class="empty"><div class="empty-mark">∅</div>没有符合条件的门店</div></td></tr>
          <tr v-for="s in filtered" v-else :key="s.id" @click="open('detail', s)"><td class="mono">{{ s.code || s.id }}</td><td><div class="strong">{{ s.name }}</div><div class="sub"><span class="tag">{{ s.city || '未填写' }}</span></div></td><td><span class="tag" :class="{ blue: s.type === 'own' }">{{ typeText(s.type) }}</span></td><td><div class="small muted">{{ s.address || '—' }}</div></td><td><div>{{ s.contact || '—' }}</div><div class="sub mono">{{ s.phone || '—' }}</div></td><td><div>{{ payeeName(s) }}</div><div class="sub">{{ s.payee?.bank || '—' }}</div><div class="sub mono">{{ s.payee?.account || '—' }}</div></td><td><StatusPill :label="`${s.rating || 'A'} 级`" :tone="ratingTone(s.rating)" /></td><td><StatusPill :label="statusText(s.status)" :tone="s.status === 'active' ? 'green' : 'red'" /></td><td class="t-right"><div>{{ s.metrics?.orders ?? s._count?.orders ?? s.orders ?? 0 }} 单</div><div class="sub">待处理 {{ s.pending || 0 }}</div></td><td class="t-right money strong">{{ s.payout == null ? '—' : money(s.payout) }}</td><td class="t-right" @click.stop><div class="table-actions"><button v-if="canEdit(s)" class="btn sm ghost" @click="open('form', s)">编辑</button><button class="btn sm" @click="open('detail', s)">详情</button></div></td></tr>
        </tbody></table></div>
      </div>
    </div>

    <BaseModal v-if="modal" :title="modalTitle" :width="modal === 'detail' ? 820 : 680" :busy="busy" @close="modal = ''">
      <template v-if="modal === 'detail' && current"><div v-if="current.status === 'frozen'" class="alert warn mb12">该门店已冻结：不可录入新单、不可送财务；存量在贷订单继续还款。</div><div class="section-title">门店基本信息</div><div class="kv two"><div class="kv-k">门店编号</div><div class="kv-v mono">{{ current.code || current.id }}</div><div class="kv-k">门店类型</div><div class="kv-v">{{ typeText(current.type) }}</div><div class="kv-k">门店名称</div><div class="kv-v strong">{{ current.name }}</div><div class="kv-k">状态</div><div class="kv-v">{{ statusText(current.status) }}</div><div class="kv-k">联系人</div><div class="kv-v">{{ current.contact || '—' }}</div><div class="kv-k">联系电话</div><div class="kv-v">{{ current.phone || '—' }}</div><div class="kv-k">城市 / 地址</div><div class="kv-v">{{ current.city }} · {{ current.address }}</div><div class="kv-k">回收协议</div><div class="kv-v">{{ agreementText(current.agreement) }}</div></div><div class="divider"></div><div class="section-title">收款账号信息</div><div class="kv two"><div class="kv-k">收款人</div><div class="kv-v">{{ payeeName(current) }}</div><div class="kv-k">开户行</div><div class="kv-v">{{ current.payee?.bank || '—' }}</div><div class="kv-k">收款账号</div><div class="kv-v mono">{{ current.payee?.account || '—' }}</div><div class="kv-k">放款方式</div><div class="kv-v">对公转账</div></div><div class="section-title mt16">门店收款二维码</div><div v-if="detailQrUrl"><img :src="detailQrUrl" alt="门店收款二维码" style="width:170px;height:170px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px"></div><div v-else class="mini-note">门店未上传收款二维码</div><div class="divider"></div><div class="section-title">经营统计</div><div class="kpis"><div class="kpi"><div class="kpi-label">进件量</div><div class="kpi-value" style="font-size:18px">{{ current.metrics?.orders ?? current.orders ?? 0 }}</div></div><div class="kpi"><div class="kpi-label">通过率</div><div class="kpi-value" style="font-size:18px">{{ current.metrics?.passRate ?? '—' }}<small v-if="current.metrics?.passRate != null">%</small></div></div><div class="kpi"><div class="kpi-label">首期逾期率</div><div class="kpi-value" style="font-size:18px">{{ current.metrics?.firstOverdueRate ?? '—' }}<small v-if="current.metrics?.firstOverdueRate != null">%</small></div></div><div class="kpi"><div class="kpi-label">累计放款</div><div class="kpi-value" style="font-size:18px">{{ money(current.payout) }}</div></div></div><div class="section-title">门店操作日志</div><div v-if="current.logs?.length" class="timeline"><div v-for="(log, i) in current.logs" :key="log.id || i" class="tl-item done"><div class="tl-title">{{ log.action || '门店操作' }}</div><div class="tl-sub">{{ dateText(log.at || log.createdAt) }} · {{ log.by || log.operator || '系统' }}</div><div v-if="log.note" class="tl-sub">{{ log.note }}</div></div></div><div v-else class="mini-note">暂无门店操作日志</div></template>
      <template v-else-if="modal === 'form'"><div class="form-grid"><div class="field"><div class="label">门店编码<span class="req">*</span></div><input v-model="edit.code" class="input mono" :disabled="!!current" placeholder="例如 DN-02"></div><div class="field"><div class="label">门店名称<span class="req">*</span></div><input v-model="edit.name" class="input"></div><div class="field"><div class="label">门店类型</div><select v-model="edit.type" class="select"><option value="partner">合作店铺</option><option value="own">自有店铺</option></select></div><div class="field"><div class="label">城市</div><input v-model="edit.city" class="input"></div><div class="field"><div class="label">联系人</div><input v-model="edit.contact" class="input"></div><div class="field"><div class="label">联系电话</div><input v-model="edit.phone" class="input"></div><div class="field full"><div class="label">地址</div><input v-model="edit.address" class="input"></div><div class="field"><div class="label">回收协议</div><select v-model="edit.agreement" class="select"><option value="pending">待签署</option><option value="active">已签署</option><option value="expiring">待续签</option><option value="not_required">无需签署</option></select></div><div class="field"><div class="label">收款人姓名</div><input v-model="edit.payee.name" class="input"></div><div class="field"><div class="label">收款账号</div><input v-model="edit.payee.account" class="input mono"></div><div class="field"><div class="label">开户行</div><input v-model="edit.payee.bank" class="input"></div><div class="field full"><div class="label">门店收款二维码（选填）</div><label class="upload-tile" :class="{ done: formQrUrl }" style="max-width:170px;height:170px"><img v-if="formQrUrl" :src="formQrUrl" alt="收款二维码" style="width:100%;height:100%;object-fit:contain"><template v-else><div class="plus">+</div><div>上传二维码</div><div class="small">选填；财务端与业务员二维码对比</div></template><input type="file" class="hide" accept="image/*" @change="payeeQrChanged"></label></div></div></template>
      <template v-else-if="modal === 'rating'"><div class="field"><div class="label">调整为</div><select v-model="edit.rating" class="select"><option value="A">A · 正常</option><option value="B">B · 影响放款比例</option><option value="C">C · 影响放款比例</option><option value="D">D · 黑名单</option></select></div><div class="field"><div class="label">修改原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea"></textarea></div></template>
      <template v-else-if="modal === 'status'"><div class="alert warn mb12">{{ edit.status === 'active' ? '恢复后可重新录单和送财务。' : '冻结后不可录新单、不可送财务，存量在贷订单继续还款。' }}</div><div class="field"><div class="label">操作原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea"></textarea></div></template>
      <template #footer><button class="btn" @click="modal = ''">关闭</button><template v-if="modal === 'detail' && current"><button v-if="canEdit(current)" class="btn" @click="open('form', current)">编辑门店</button><button v-if="auth.can('manageStores')" class="btn" @click="open('rating', current)">修改评级</button><button v-if="auth.can('manageStores')" class="btn" :class="current.status === 'active' ? 'danger' : 'primary'" @click="open('status', current)">{{ current.status === 'active' ? '冻结门店' : '恢复门店' }}</button><RouterLink class="btn primary" :to="`/orders?store=${current.id}`">查看订单</RouterLink></template><button v-else class="btn primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '确认保存' }}</button></template>
    </BaseModal>
  </AppShell>
</template>
