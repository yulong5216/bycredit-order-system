<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '../components/AppShell.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusPill from '../components/StatusPill.vue'
import { api, saveBlob } from '../api'
import { useAuthStore } from '../stores/auth'
import { DOC_TYPES, dateText, money, normalizeOrder, payoutAmount } from '../utils/format'
import { toast } from '../utils/feedback'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = route.params.id
const order = ref(normalizeOrder())
const loading = ref(true)
const busy = ref(false)
const tab = ref('profile')
const modal = ref('')
const reviewNote = ref('')
const edit = reactive({})
const checks = reactive({ first: Array(8).fill(true), final: Array(5).fill(true) })
const tabs = [['profile', '客户资料'], ['docs', '影像资料'], ['esign', '演示签约'], ['plan', '分期方案'], ['device', '设备信息'], ['money', 'MDM 与放款'], ['log', '操作日志']]
const firstChecklist = [['身份证正反面清晰且在有效期内', '系统记录与证件一致'], ['证件姓名 / 号码与录单一致', '重点核对越文拼写'], ['工作证明与填表单位一致', ''], ['银行流水 3 个月可读', ''], ['员工与客户合影已上传', ''], ['手机号实名且满 6 个月', ''], ['手机串码实拍与 IMEI 一致', ''], ['常用住址照片可辨识', '']]
const finalChecklist = ['客户资料与影像资料一一对应', '分期方案 / 每期还款额 / 期数正确', 'MDM 序列号与 IMEI 已登记', '门店收款信息已确认', '放款金额与门店已确认']
const signed = computed(() => ['已签署', 'signed', 'success', 'succeeded', 'completed'].includes(order.value.esign.status))
const esignStatus = computed(() => ({ not_started: '未发起', pending: '等待演示结果', succeeded: '演示签约成功', failed: '演示签约失败' }[order.value.esign.status] || order.value.esign.status))
const canStartEsign = computed(() => auth.can('reviewFirst') && ['pending_first', 'rejected_first'].includes(order.value.status) && !signed.value)
const canSimulateEsign = computed(() => auth.can('reviewFirst') && order.value.status === 'pending_customer_sign')
const canEditMdm = computed(() => auth.can('reviewFirst') && ['pending_first', 'rejected_first', 'pending_customer_sign', 'pending_final'].includes(order.value.status))
const canEditCustomer = computed(() => auth.can('updateOrder') && ['draft', 'pending_first', 'rejected_first', 'pending_customer_sign'].includes(order.value.status))
const canUploadDocs = computed(() => auth.can('updateOrder') && !order.value.payout.at && !['repaying', 'overdue', 'breach', 'closed', 'cancelled'].includes(order.value.status))
const uploadedDocs = computed(() => DOC_TYPES.filter(d => order.value.docs[d.key]?.storageName).length)
const gate = computed(() => {
  const list = []
  if (!signed.value) list.push('演示签约未完成')
  if (!order.value.mdm.bound) list.push('MDM 操作结果未登记')
  if (!order.value.payee.account) list.push('门店收款信息缺失')
  return list
})
const logs = computed(() => order.value.logs || [])
const paidPeriods = computed(() => order.value.bills.filter(b => ['Paid', 'Settled'].includes(b.status)).length)
const storePayee = computed(() => order.value.store?.payee || {})
const payeeMatchesStore = computed(() => {
  const entered = String(order.value.payee?.account || '').replace(/\D/g, '')
  const store = String(storePayee.value.account || '').replace(/\D/g, '')
  return Boolean(entered && store && entered === store)
})
const payeeQr = ref('')
const storeQr = ref('')
const noteInput = ref('')
const canCancel = computed(() => auth.role === 'admin' && !['closed', 'cancelled'].includes(order.value.status))
const notes = computed(() => (order.value.logs || []).filter(l => l.action === '添加备注').reverse())
const modalTitle = computed(() => ({ profile: '二次编辑客户资料', plan: '调整分期方案', dueDate: '修改首期还款日', payee: '门店收款信息', mdm: '登记 MDM 绑定结果', unbind: '登记 MDM 解绑结果', signOk: '演示签约 · 模拟成功', signFail: '演示签约 · 模拟失败', payout: '标记已放款', note: '添加跟进备注', cancel: '取消订单', finance: '财务审批' }[modal.value] || ''))

async function load() {
  loading.value = true
  try {
    const data = await api.getOrder(id)
    order.value = normalizeOrder(data)
    const [billResult, logResult] = await Promise.allSettled([api.getBills(id), api.orderLogs(id)])
    if (billResult.status === 'fulfilled') {
      const d = billResult.value
      order.value.bills = Array.isArray(d) ? d : (d.items || d.bills || order.value.bills || [])
    }
    if (logResult.status === 'fulfilled') {
      const d = logResult.value
      order.value.logs = Array.isArray(d) ? d : (d.items || d.logs || order.value.logs || [])
    }
    await loadPayeeQr()
    await loadStoreQr()
  } catch (error) { toast(error.message, 'err') } finally { loading.value = false }
}
async function loadPayeeQr() {
  if (payeeQr.value) { URL.revokeObjectURL(payeeQr.value); payeeQr.value = '' }
  if (!order.value.docs?.payee_qr?.storageName) return
  try {
    const blob = await api.downloadDoc(id, 'payee_qr')
    payeeQr.value = URL.createObjectURL(blob)
  } catch {}
}
async function loadStoreQr() {
  if (storeQr.value) { URL.revokeObjectURL(storeQr.value); storeQr.value = '' }
  const storeId = order.value.store?.id
  if (!storeId || !order.value.store?.payee?.qr?.storageName) return
  try {
    const blob = await api.downloadStorePayeeQr(storeId)
    storeQr.value = URL.createObjectURL(blob)
  } catch {}
}
async function addNote() {
  const note = noteInput.value.trim()
  if (!note) return toast('请输入备注', 'err')
  if (busy.value) return
  busy.value = true
  try {
    await api.addNote(id, note)
    noteInput.value = ''
    await load()
    toast('备注已添加')
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function run(action, success) {
  if (busy.value) return
  busy.value = true
  try { await action(); modal.value = ''; await load(); if (success) toast(success) }
  catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
async function copySerial() {
  const serial = order.value.mdm?.serial
  if (!serial) return toast('暂无可复制的序列号', 'err')
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(serial)
    else { const ta = document.createElement('textarea'); ta.value = serial; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    toast('序列号已复制：' + serial)
  } catch { toast('复制失败，请手动选择复制', 'err') }
}
function review(kind, result) {
  if (result === 'reject' && !reviewNote.value.trim()) return toast('驳回请填写原因', 'err')
  const data = { result, note: reviewNote.value.trim(), checks: checks[kind] }
  const action = kind === 'first' ? () => api.firstReview(id, data) : () => api.finalReview(id, data)
  run(action, `${kind === 'first' ? '初审' : '终审'}${result === 'pass' ? '已通过' : '已驳回'}`).then(() => { reviewNote.value = '' })
}
function openModal(type) {
  Object.keys(edit).forEach(k => delete edit[k])
  const o = order.value
  if (type === 'profile') Object.assign(edit, { ...o.customer })
  if (type === 'plan') Object.assign(edit, { price: o.plan.price, perPeriod: o.plan.perPeriod, periods: o.plan.periods })
  if (type === 'dueDate') Object.assign(edit, { firstDueDate: String(o.plan.firstDueDate || '').slice(0, 10), note: '' })
  if (type === 'payee') Object.assign(edit, { name: o.payee.name || '', account: o.payee.account || '', payeeQrFile: null, payeeQrUrl: '' })
  if (type === 'mdm') Object.assign(edit, { serial: o.mdm.serial || '' })
  if (type === 'signOk') edit.contractNo = ''
  if (['signFail', 'unbind', 'note', 'cancel', 'finance', 'payout'].includes(type)) Object.assign(edit, { note: '', reason: '', ref: '' })
  modal.value = type
}
function saveModal() {
  const type = modal.value
  if (type === 'profile') return run(() => api.updateOrder(id, { customer: { ...edit } }), '客户资料已更新')
  if (type === 'plan') {
    if (!Number(edit.price) || !Number(edit.periods) || !(Number(edit.perPeriod) > 0)) return toast('请检查放款金额、期数与每期还款额', 'err')
    return run(() => api.updatePlan(id, { price: Number(edit.price), periods: Number(edit.periods), perPeriod: Number(edit.perPeriod) }), '分期方案已更新')
  }
  if (type === 'dueDate') {
    if (!edit.firstDueDate) return toast('请选择首期还款日', 'err')
    if (!edit.note?.trim()) return toast('请填写修改原因', 'err')
    return run(() => api.updateDueDate(id, edit.firstDueDate, edit.note.trim()), '还款日已更新')
  }
  if (type === 'payee') {
    if (!edit.name?.trim() || !edit.account?.trim()) return toast('收款人与账号必填', 'err')
    return run(async () => {
      await api.updateOrder(id, { payee: { name: edit.name.trim(), account: edit.account.trim() } })
      if (edit.payeeQrFile) await api.uploadDoc(id, 'payee_qr', edit.payeeQrFile)
    }, '收款信息已保存')
  }
  if (type === 'mdm') {
    if (!edit.serial?.trim()) return toast('监管锁序列号必填', 'err')
    return run(() => api.bindMdm(id, { serial: edit.serial.trim() }), '监管锁序列号已登记')
  }
  if (type === 'unbind') {
    if (!edit.note?.trim()) return toast('解绑原因必填', 'err')
    return run(() => api.unbindMdm(id, edit.note.trim()), 'MDM 解绑结果已登记')
  }
  if (type === 'signOk') {
    if (!edit.contractNo?.trim()) return toast('请填写演示签约编号', 'err')
    if (!edit.contractNo.trim().toUpperCase().startsWith('MOCK-')) return toast('演示签约编号必须以 MOCK- 开头', 'err')
    return run(() => api.simulateEsign(id, { ok: true, contractNo: edit.contractNo.trim(), reason: '' }), '演示签约成功结果已回填')
  }
  if (type === 'signFail') {
    if (!edit.reason?.trim()) return toast('请填写演示失败原因', 'err')
    return run(() => api.simulateEsign(id, { ok: false, contractNo: '', reason: edit.reason.trim() }), '演示签约失败结果已回填')
  }
  if (type === 'payout') {
    if (!edit.ref?.trim()) return toast('请填写银行回单号', 'err')
    return run(() => api.payout(id, edit.ref.trim()), '已标记放款，订单进入还款中')
  }
  if (type === 'note') {
    if (!edit.note?.trim()) return toast('请输入备注', 'err')
    return run(() => api.addNote(id, edit.note.trim()), '备注已保存')
  }
  if (type === 'cancel') {
    if (!edit.note?.trim()) return toast('取消原因必填', 'err')
    return run(() => api.cancelOrder(id, edit.note.trim()), '订单已取消')
  }
  if (type === 'finance') return run(() => api.financeApprove(id, edit.note || ''), '财务审批通过，等待放款')
}
async function uploadDoc(key, event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file || busy.value) return
  try { await run(() => api.uploadDoc(id, key, file), '影像资料已上传') } finally { input.value = '' }
}
async function downloadDoc(key) {
  if (busy.value) return
  busy.value = true
  try {
    const data = await api.downloadDoc(id, key)
    saveBlob(data, order.value.docs[key]?.name || `${key}.bin`)
  } catch (error) { toast(error.message, 'err') } finally { busy.value = false }
}
function flowClass(step) {
  const o = order.value
  const s = o.status
  const conditions = [true, !['draft', 'pending_first', 'rejected_first'].includes(s), signed.value, !!o.review.final || ['approved_final', 'pending_finance', 'pending_payout', 'repaying', 'overdue', 'breach', 'closed'].includes(s), ['pending_payout', 'repaying', 'overdue', 'breach', 'closed'].includes(s), ['repaying', 'overdue', 'breach', 'closed'].includes(s)]
  if (conditions[step]) return 'done'
  const firstPending = conditions.findIndex(v => !v)
  return step === firstPending && !s.startsWith('rejected') ? 'now' : ''
}
onMounted(load)
</script>

<template>
  <AppShell title="订单详情">
    <div class="page">
      <div class="back" @click="router.push('/orders')">← 返回订单池</div>
      <div v-if="loading" class="card loading-block">订单加载中…</div>
      <template v-else>
        <div class="card mb16">
          <div class="hero">
            <div><div class="hero-title"><span class="mono">{{ order.no || order.id }}</span><StatusPill :status="order.status" /><span v-if="order.urgent" class="tag urgent">加急</span></div><div class="hero-meta"><span>客户：<b>{{ order.customer.name }}</b> · {{ order.customer.phone }}</span><span>门店：{{ order.plan.storeName || order.store.name }}</span><span>业务员：{{ order.plan.salesName || '—' }}</span><span>提交：{{ dateText(order.submittedAt || order.createdAt) }}</span></div></div>
            <div style="text-align:right"><div class="mini-note">放款给门店</div><div class="money-strong" style="font-size:18px">{{ money(payoutAmount(order)) }}</div><div class="mini-note">{{ order.plan.periods }} 期 × {{ money(order.plan.perPeriod) }}</div></div>
          </div>
          <div v-if="order.customerHistory.length" class="alert info" style="margin:12px 18px"><span>历史</span><span>该客户有 {{ order.customerHistory.length }} 笔历史订单：<span v-for="h in order.customerHistory" :key="h.id || h.no" class="mono">{{ h.no }}（{{ h.label || h.status }}） </span></span></div>
          <div v-if="order.rejectReason" class="alert danger" style="margin:12px 18px"><span>驳回</span><span>{{ order.rejectReason }}</span></div>
        </div>

        <div class="detail-grid">
          <div class="stack">
            <div class="card"><div class="tabs-wrap"><div class="tabs"><button v-for="t in tabs" :key="t[0]" class="tab" :class="{ active: tab === t[0] }" style="border-top:0;border-left:0;border-right:0;background:transparent" @click="tab = t[0]">{{ t[1] }}</button></div></div><div class="card-body">
              <template v-if="tab === 'profile'">
                <div class="row-between mb12"><div class="section-title" style="margin:0">客户基本信息</div><button v-if="canEditCustomer" class="btn sm" @click="openModal('profile')">二次编辑</button></div>
                <div class="kv two"><div class="kv-k">姓名</div><div class="kv-v">{{ order.customer.name }}</div><div class="kv-k">证件号码</div><div class="kv-v mono">{{ order.customer.idNo }}</div><div class="kv-k">手机号</div><div class="kv-v">{{ order.customer.phone }}</div><div class="kv-k">证件类型</div><div class="kv-v">{{ order.customer.idType || 'CCCD' }}</div><div class="kv-k">常居住址</div><div class="kv-v">{{ order.customer.address }}</div><div class="kv-k">出生 / 性别</div><div class="kv-v">{{ order.customer.birthDate || '—' }} · {{ order.customer.gender || '—' }}</div><div class="kv-k">紧急联系人</div><div class="kv-v">{{ order.customer.emergencyName }} · {{ order.customer.emergencyRelation }}</div><div class="kv-k">紧急联系电话</div><div class="kv-v">{{ order.customer.emergencyPhone }}</div><div class="kv-k">门店</div><div class="kv-v">{{ order.plan.storeName || order.store.name }}</div><div class="kv-k">录入来源</div><div class="kv-v">{{ order.source || '业务员录单' }}</div></div>
              </template>

              <template v-else-if="tab === 'docs'">
                <div class="row-between mb12"><div class="section-title" style="margin:0">影像资料 <span class="card-sub">已上传 {{ uploadedDocs }} / {{ DOC_TYPES.length }} 项（选填）</span></div><span class="tag" :class="uploadedDocs ? 'ok' : 'gray'">{{ uploadedDocs ? '已上传' : '暂无资料' }}</span></div>
                <div class="doc-grid">
                  <div v-for="doc in DOC_TYPES" :key="doc.key" class="doc-card">
                    <div class="doc-thumb"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7E8FA9" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></div>
                    <div class="doc-meta">
                      <div class="doc-name">{{ doc.label }}</div>
                      <div class="doc-sub">{{ order.docs[doc.key]?.storageName ? order.docs[doc.key].name : '未上传' }}</div>
                      <div class="row mt8">
                        <button v-if="order.docs[doc.key]?.storageName" type="button" class="btn link" :disabled="busy" @click="downloadDoc(doc.key)">下载文件</button>
                        <label v-if="canUploadDocs" class="btn link">{{ order.docs[doc.key]?.storageName ? '替换文件' : '选择真实文件' }}<input type="file" class="hide" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" :disabled="busy" @change="uploadDoc(doc.key, $event)"></label>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="alert info mt12">支持 JPG、PNG、WEBP、HEIC、HEIF、PDF，单个文件不超过 10 MB；仅登记实际上传的资料文件。</div>
              </template>

              <template v-else-if="tab === 'esign'">
                <div class="row-between mb12"><div class="section-title" style="margin:0">电子签约</div><span class="demo-badge">演示签约</span></div>
                <div class="alert warn mb12"><span>阶段边界</span><span>本阶段仅模拟签约结果，不创建真实合同、不发送短信，也不代表任何第三方签约服务已完成对接。</span></div>
                <div class="req-chips"><span class="req-chip" :class="signed ? 'ok' : 'no'">演示签约 {{ signed ? '已成功' : esignStatus }}</span><span class="req-chip" :class="order.mdm.bound ? 'ok' : 'no'">MDM {{ order.mdm.bound ? '已登记' : '未登记' }}</span><span class="req-chip" :class="order.payee.account ? 'ok' : 'no'">收款信息 {{ order.payee.account ? '已填写' : '缺失' }}</span></div>
                <div class="demo-panel mt16"><div class="kv two"><div class="kv-k">当前状态</div><div class="kv-v">{{ esignStatus }}</div><div class="kv-k">演示签约编号</div><div class="kv-v mono">{{ order.esign.contractNo || '—' }}</div><div class="kv-k">发起时间</div><div class="kv-v">{{ dateText(order.esign.uploadedAt || order.esign.startedAt) }}</div><div class="kv-k">完成时间</div><div class="kv-v">{{ dateText(order.esign.signedAt) }}</div></div>
                  <div v-if="order.esign.failReason" class="warn-line mt12">上次演示失败：{{ order.esign.failReason }}</div>
                  <div v-if="canStartEsign || canSimulateEsign" class="page-actions mt16"><button v-if="canStartEsign" class="btn primary" :disabled="busy" @click="run(() => api.startEsign(id), '演示签约已发起')">{{ order.esign.status === 'failed' ? '重新发起演示签约' : '发起演示签约' }}</button><template v-if="canSimulateEsign"><button class="btn success" :disabled="busy" @click="openModal('signOk')">模拟签约成功</button><button class="btn danger" :disabled="busy" @click="openModal('signFail')">模拟签约失败</button></template></div>
                </div>
                <div class="side-block"><div class="side-title">演示签约操作记录</div><table class="table compact"><thead><tr><th>次数</th><th>演示编号</th><th>动作</th><th>操作人</th><th>时间</th></tr></thead><tbody><tr v-for="(log, i) in order.esignAttempts" :key="log.id || i" class="no-cursor"><td>#{{ log.attempt || i + 1 }}</td><td class="mono">{{ log.contractNo || '—' }}</td><td>{{ log.action || (log.ok ? '模拟成功' : '模拟失败') }}</td><td>{{ log.by || '—' }}</td><td>{{ dateText(log.at || log.createdAt) }}</td></tr><tr v-if="!order.esignAttempts.length"><td colspan="5" class="muted">暂无演示签约记录</td></tr></tbody></table></div>
              </template>

              <template v-else-if="tab === 'plan'">
                <div class="row-between mb12"><div class="section-title" style="margin:0">分期方案</div><div v-if="auth.can('reviewFirst')" class="page-actions"><button class="btn sm" @click="openModal('dueDate')">修改还款日</button><button class="btn sm" @click="openModal('plan')">调整方案</button></div></div>
                <div class="kv two"><div class="kv-k">放款金额</div><div class="kv-v">{{ money(order.plan.price) }}</div><div class="kv-k">分期期数</div><div class="kv-v">{{ order.plan.periods }} 期</div><div class="kv-k">每期还款额</div><div class="kv-v">{{ money(order.plan.perPeriod) }}</div><div class="kv-k">首期还款日</div><div class="kv-v">{{ order.plan.firstDueDate }}</div><div class="kv-k">利息合计</div><div class="kv-v">{{ money(Number(order.plan.perPeriod) * Number(order.plan.periods) - Number(order.plan.price)) }}</div><div class="kv-k">还款总额</div><div class="kv-v strong">{{ money(Number(order.plan.perPeriod) * Number(order.plan.periods)) }}</div></div>
                <div class="side-block"><div class="side-title">还款计划</div><div class="table-wrap"><table class="table compact"><thead><tr><th>期次</th><th>应还日</th><th class="t-right">金额</th><th>状态</th><th>实还时间</th></tr></thead><tbody><tr v-for="b in order.bills" :key="b.period" class="no-cursor"><td>第 {{ b.period }} / {{ order.plan.periods }} 期</td><td class="mono">{{ b.dueDate }}</td><td class="t-right money">{{ money(b.amount) }}</td><td><StatusPill :status="b.status" bill /></td><td>{{ dateText(b.paidAt) }}</td></tr><tr v-if="!order.bills.length"><td colspan="5" class="muted">账单将在放款后生成</td></tr></tbody></table></div></div>
              </template>

              <template v-else-if="tab === 'device'"><div class="section-title">设备与验机</div><div class="kv two"><div class="kv-k">机型</div><div class="kv-v">{{ order.device.model }}</div><div class="kv-k">容量 / 颜色</div><div class="kv-v">{{ order.device.capacity }} · {{ order.device.color }}</div><div class="kv-k">IMEI</div><div class="kv-v mono">{{ order.device.imei }}</div><div class="kv-k">验机评分</div><div class="kv-v">{{ order.device.score || '已记录' }}</div><div class="kv-k">供货方式</div><div class="kv-v">合作门店现货</div><div class="kv-k">库存归属</div><div class="kv-v">门店所有（我方不放库存）</div></div><div class="alert info mt12">设备由门店直接交付客户，流程中没有出库环节。</div></template>

              <template v-else-if="tab === 'money'">
                <div class="row-between mb12"><div class="section-title" style="margin:0">监管锁（MDM）序列号登记</div><div v-if="canEditMdm" class="page-actions">
                  <button v-if="order.mdm.bound" class="btn sm" :disabled="!order.mdm.serial" @click="copySerial">复制序列号</button>
                  <button v-if="order.mdm.bound" class="btn sm danger" @click="openModal('unbind')">登记解绑</button>
                  <button class="btn sm" @click="openModal('mdm')">{{ order.mdm.bound ? '修改序列号' : '登记序列号' }}</button>
                </div></div>
                <div class="alert info mb12">本系统仅保存监管锁序列号记录，不连接 MDM 平台接口。如需解除绑定请去 MDM 系统操作后回这里登记。</div>
                <div class="kv two"><div class="kv-k">监管锁序列号</div><div class="kv-v mono">
                  <template v-if="order.mdm.bound">{{ order.mdm.serial || '—' }}</template>
                  <span v-else class="muted">未登记</span>
                  <button v-if="order.mdm.bound && order.mdm.serial" class="mini-btn ml8" @click="copySerial">复制</button>
                </div><div class="kv-k">登记状态</div><div class="kv-v"><StatusPill :label="order.mdm.bound ? '已登记' : '未登记'" :tone="order.mdm.bound ? 'green' : 'gray'" /></div><div class="kv-k">登记时间</div><div class="kv-v">{{ dateText(order.mdm.boundAt) }}</div><div class="kv-k">登记人</div><div class="kv-v">{{ order.mdm.boundBy || '—' }}</div></div>
                <div class="row-between mb12 mt24"><div class="section-title" style="margin:0">收款信息（门店默认 vs 业务员录入）</div><button v-if="auth.can('reviewFirst')" class="btn sm" @click="openModal('payee')">修改 / 补录</button></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div class="kv two"><div class="kv-k">门店默认</div><div class="kv-v">{{ storePayee.holder || storePayee.name || '—' }}</div><div class="kv-k">账号</div><div class="kv-v mono">{{ storePayee.account || '—' }}</div><div class="kv-k">开户行</div><div class="kv-v">{{ storePayee.bank || '—' }}</div></div>
                  <div class="kv two"><div class="kv-k">业务员录入</div><div class="kv-v">{{ order.payee.name || '—' }}</div><div class="kv-k">账号</div><div class="kv-v mono">{{ order.payee.account || '—' }}</div><div class="kv-k">二维码</div><div class="kv-v">{{ order.docs?.payee_qr?.storageName ? '已上传' : '未上传' }}</div></div>
                </div>
                <div class="req-chips mt12"><span class="req-chip" :class="payeeMatchesStore ? 'ok' : 'no'">{{ payeeMatchesStore ? '账号与门店默认一致' : '账号与门店默认不一致，请财务核对' }}</span></div>
                <div class="mt12" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div><div class="small muted">门店默认收款二维码</div><img v-if="storeQr" :src="storeQr" alt="门店默认收款二维码" style="width:170px;height:170px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;margin-top:6px"><div v-else class="mini-note" style="margin-top:6px">门店未录默认二维码</div></div>
                  <div><div class="small muted">业务员上传的收款二维码</div><img v-if="payeeQr" :src="payeeQr" alt="业务员上传收款二维码" style="width:170px;height:170px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;margin-top:6px"><div v-else class="mini-note" style="margin-top:6px">业务员未上传收款二维码</div></div>
                </div>
                <div class="side-block"><div class="side-title">财务与放款</div><div class="kv two"><div class="kv-k">放款金额</div><div class="kv-v strong">{{ money(payoutAmount(order)) }}</div><div class="kv-k">财务状态</div><div class="kv-v">{{ order.finance.status }}</div><div class="kv-k">审批人 / 时间</div><div class="kv-v">{{ order.finance.by || '—' }} · {{ dateText(order.finance.at) }}</div><div class="kv-k">放款状态</div><div class="kv-v">{{ order.payout.status }}</div><div class="kv-k">银行回单号</div><div class="kv-v mono">{{ order.payout.ref || '—' }}</div></div></div>
              </template>

              <template v-else><div class="section-title">操作日志 <span class="card-sub">共 {{ logs.length }} 条 · 只增不删</span></div><div v-if="logs.length" class="timeline"><div v-for="(log, i) in logs" :key="log.id || i" class="tl-item done"><div class="tl-title">{{ log.action }}</div><div class="tl-sub">{{ dateText(log.at || log.createdAt) }} · {{ log.by || log.operator || '系统' }} / {{ log.role || '—' }}</div><div v-if="log.before || log.after" class="tl-sub">{{ log.before || '—' }} → {{ log.after || '—' }}</div><div v-if="log.note" class="tl-sub">说明：{{ log.note }}</div></div></div><div v-else class="empty">暂无操作日志</div></template>
            </div></div>

            <div class="card"><div class="card-head"><div class="card-title">流程进度 & 跟进备注 <span class="card-sub">共 {{ notes.length }} 条备注</span></div><span class="tag">{{ order.status.startsWith('rejected') ? '已驳回' : '进行中' }}</span></div><div class="card-body" style="display:flex;gap:24px">
              <div style="flex:0 0 45%"><div class="section-title-sm">进度时间线</div><div class="timeline">
                <div class="tl-item" :class="flowClass(0)"><div class="tl-title">录单提交</div><div class="tl-sub">{{ dateText(order.submittedAt || order.createdAt) }}</div></div>
                <div class="tl-item" :class="flowClass(1)"><div class="tl-title">初审</div><div class="tl-sub">{{ order.review.first ? `${order.review.first.by || '审核人'} · ${dateText(order.review.first.at)}` : '核对资料 / 演示签约 / MDM 登记' }}</div></div>
                <div class="tl-item" :class="flowClass(2)"><div class="tl-title">签约</div><div class="tl-sub">{{ signed ? `成功 · ${dateText(order.esign.signedAt)}` : esignStatus || '未发起' }}</div></div>
                <div class="tl-item" :class="flowClass(3)"><div class="tl-title">终审</div><div class="tl-sub">{{ order.review.final ? `${order.review.final.by || '审核人'} · ${dateText(order.review.final.at)}` : '等待终审核对' }}</div></div>
                <div class="tl-item" :class="flowClass(4)"><div class="tl-title">财务审核</div><div class="tl-sub">{{ order.finance.by ? `${order.finance.by} · ${dateText(order.finance.at)}` : order.finance.status }}</div></div>
                <div class="tl-item" :class="flowClass(5)"><div class="tl-title">放款</div><div class="tl-sub">{{ order.payout.at ? `${dateText(order.payout.at)} · ${order.payout.ref}` : '等待银行打款' }}</div></div>
              </div></div>
              <div style="flex:1;min-width:0"><div class="section-title-sm">跟进备注</div>
                <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px"><textarea v-model="noteInput" class="textarea" style="flex:1;min-height:48px;resize:vertical" placeholder="例如：已电话联系客户，明日补交流水"></textarea><button class="btn primary" style="height:38px;white-space:nowrap" :disabled="busy || !noteInput.trim()" @click="addNote">添加</button></div>
                <div v-if="notes.length" class="timeline" style="max-height:280px;overflow-y:auto"><div v-for="(n, i) in notes" :key="n.id || i" class="tl-item done"><div class="tl-title" style="font-size:13px;font-weight:400;line-height:1.5">{{ n.note }}</div><div class="tl-sub">{{ n.by || n.operator || '系统' }} · {{ dateText(n.at || n.createdAt) }}</div></div></div>
                <div v-else class="mini-note">暂无跟进备注</div>
              </div>
            </div></div>
          </div>

          <div class="detail-side sticky">
            <div v-if="order.status === 'pending_first'" class="card"><div class="card-head"><div class="card-title">初审操作台</div></div><div class="card-body">
              <div class="req-chips"><span class="req-chip" :class="signed ? 'ok' : 'no'">演示签约 {{ signed ? '已完成' : '未完成' }}</span><span class="req-chip" :class="order.mdm.bound ? 'ok' : 'no'">MDM {{ order.mdm.bound ? '已登记' : '未登记' }}</span><span class="req-chip" :class="order.payee.account ? 'ok' : 'no'">收款信息 {{ order.payee.account ? '已填写' : '缺失' }}</span></div>
              <div v-if="gate.length" class="warn-line mt12">初审通过前需完成：{{ gate.join('、') }}</div><div v-else class="alert ok mt12">前置条件已满足。</div>
              <div class="side-block mt12"><div class="side-title">核对清单</div><div class="checklist"><label v-for="(check, i) in firstChecklist" :key="check[0]" class="check" :class="{ on: checks.first[i] }"><input v-model="checks.first[i]" type="checkbox"><span><span class="k">{{ check[0] }}</span><span v-if="check[1]" class="d">{{ check[1] }}</span></span></label></div></div>
              <div v-if="auth.can('reviewFirst')" class="action-stack mt12"><button class="btn primary" :disabled="busy || gate.length" @click="review('first', 'pass')">通过 · 转终审</button><button class="btn danger" :disabled="busy" @click="review('first', 'reject')">驳回</button><button v-if="canCancel" class="btn" @click="openModal('cancel')">取消订单</button></div>
              <div v-else class="alert info mt12">当前角色无初审权限。</div>
              <textarea v-if="auth.can('reviewFirst')" v-model="reviewNote" class="textarea mt12" placeholder="驳回原因必填；通过时可选填审核备注"></textarea>
            </div></div>
            <div v-else-if="order.status === 'pending_customer_sign'" class="card"><div class="card-head"><div class="card-title">等待演示签约结果</div></div><div class="card-body"><div class="alert info">本阶段只模拟结果回填，不产生真实合同。</div><div v-if="auth.can('reviewFirst')" class="action-stack mt12"><button class="btn success" @click="openModal('signOk')">模拟签约成功</button><button class="btn danger" @click="openModal('signFail')">模拟签约失败</button><button v-if="!order.mdm.bound" class="btn" @click="openModal('mdm')">登记 MDM 绑定结果</button></div><button v-if="canCancel" class="btn block mt12" @click="openModal('cancel')">取消订单</button></div></div>
            <div v-else-if="order.status === 'pending_final'" class="card"><div class="card-head"><div class="card-title">终审操作台</div></div><div class="card-body"><div class="kv"><div class="kv-k">演示签约</div><div class="kv-v">{{ order.esign.contractNo }}</div><div class="kv-k">MDM</div><div class="kv-v mono">{{ order.mdm.serial }}</div><div class="kv-k">放款金额</div><div class="kv-v strong">{{ money(payoutAmount(order)) }}</div></div>
              <div v-if="gate.length" class="warn-line mt12">终审通过前需完成：{{ gate.join('、') }}</div><div v-else class="alert ok mt12">前置条件已满足。</div>
              <div class="side-block mt12"><div class="side-title">核对清单</div><div class="checklist"><label v-for="(check, i) in finalChecklist" :key="check" class="check" :class="{ on: checks.final[i] }"><input v-model="checks.final[i]" type="checkbox"><span class="k">{{ check }}</span></label></div></div>
              <template v-if="auth.can('reviewFinal')"><div class="action-stack mt12"><button class="btn primary" :disabled="busy" @click="review('final', 'pass')">通过 · 待送财务</button><button class="btn danger" :disabled="busy" @click="review('final', 'reject')">驳回</button><button v-if="canCancel" class="btn" @click="openModal('cancel')">取消订单</button></div><textarea v-model="reviewNote" class="textarea mt12" placeholder="驳回原因必填；通过时可选填审核备注"></textarea></template><div v-else class="alert info mt12">当前角色无终审权限。</div></div></div>
            <div v-else-if="order.status === 'approved_final'" class="card"><div class="card-head"><div class="card-title">终审通过 · 待送财务</div></div><div class="card-body"><div class="alert ok">资料、演示签约和 MDM 登记均已确认。</div><div class="kv mt12"><div class="kv-k">收款人</div><div class="kv-v">{{ order.payee.name }}</div><div class="kv-k">账号</div><div class="kv-v mono">{{ order.payee.account }}</div><div class="kv-k">金额</div><div class="kv-v strong">{{ money(payoutAmount(order)) }}</div></div><button v-if="auth.can('reviewFinal')" class="btn primary block mt16" :disabled="busy" @click="run(() => api.sendFinance(id), '已发送财务审核')">一键发送财务审核</button><button v-if="canCancel" class="btn block mt12" @click="openModal('cancel')">取消订单</button></div></div>
            <div v-else-if="order.status === 'pending_finance'" class="card"><div class="card-head"><div class="card-title">财务审批</div></div><div class="card-body"><div class="kv"><div class="kv-k">收款人</div><div class="kv-v">{{ order.payee.name }}</div><div class="kv-k">账号</div><div class="kv-v mono">{{ order.payee.account }}</div><div class="kv-k">放款金额</div><div class="kv-v strong">{{ money(payoutAmount(order)) }}</div></div><button v-if="auth.can('finance')" class="btn primary block mt16" @click="openModal('finance')">审批通过 · 待放款</button><button v-if="canCancel" class="btn block mt12" @click="openModal('cancel')">取消订单</button></div></div>
            <div v-else-if="order.status === 'pending_payout'" class="card"><div class="card-head"><div class="card-title">待放款</div></div><div class="card-body"><div class="alert warn">财务审批已通过。银行软件打款完成后回填回单号。</div><div class="kv mt12"><div class="kv-k">收款人</div><div class="kv-v">{{ order.payee.name }}</div><div class="kv-k">账号</div><div class="kv-v mono">{{ order.payee.account }}</div><div class="kv-k">金额</div><div class="kv-v strong">{{ money(payoutAmount(order)) }}</div></div><button v-if="auth.can('finance')" class="btn primary block mt16" @click="openModal('payout')">标记已放款</button><button v-if="canCancel" class="btn block mt12" @click="openModal('cancel')">取消订单</button></div></div>
            <div v-else-if="order.status.startsWith('rejected') || order.status === 'draft'" class="card"><div class="card-head"><div class="card-title">{{ order.status === 'draft' ? '草稿订单' : '订单已驳回' }}</div></div><div class="card-body"><div v-if="order.rejectReason" class="alert danger">{{ order.rejectReason }}</div><button v-if="auth.can('createOrder')" class="btn primary block mt12" :disabled="busy" @click="run(() => api.submitOrder(id), '已提交初审')">{{ order.status === 'draft' ? '提交初审' : '重新提交初审' }}</button><button v-if="canCancel" class="btn block mt12" @click="openModal('cancel')">取消订单</button></div></div>
            <div v-else class="card"><div class="card-head"><div class="card-title">还款状态</div></div><div class="card-body"><div class="kv"><div class="kv-k">已还期数</div><div class="kv-v">{{ paidPeriods }} / {{ order.bills.length }}</div><div class="kv-k">待还期数</div><div class="kv-v">{{ order.bills.length - paidPeriods }}</div><div class="kv-k">放款回单</div><div class="kv-v mono">{{ order.payout.ref || '—' }}</div></div><RouterLink v-if="auth.can('viewBills')" class="btn primary block mt12" :to="`/bills?q=${order.no}`">查看账单</RouterLink></div></div>
          </div>
        </div>
      </template>
    </div>

    <BaseModal v-if="modal" :title="modalTitle" :busy="busy" @close="modal = ''">
      <div v-if="modal === 'profile'" class="form-grid"><div class="field"><div class="label">姓名</div><input v-model="edit.name" class="input"></div><div class="field"><div class="label">手机号</div><input v-model="edit.phone" class="input"></div><div class="field"><div class="label">证件号码</div><input v-model="edit.idNo" class="input"></div><div class="field"><div class="label">紧急联系人</div><input v-model="edit.emergencyName" class="input"></div><div class="field full"><div class="label">常居住址</div><input v-model="edit.address" class="input"></div><div class="field"><div class="label">紧急联系人电话</div><input v-model="edit.emergencyPhone" class="input"></div><div class="field"><div class="label">关系</div><input v-model="edit.emergencyRelation" class="input"></div></div>
      <div v-else-if="modal === 'plan'" class="form-grid"><div class="field"><div class="label">放款金额（₫）</div><input v-model="edit.price" class="input" type="number"></div><div class="field"><div class="label">每期还款额（₫）</div><input v-model="edit.perPeriod" class="input" type="number"></div><div class="field"><div class="label">期数</div><input v-model="edit.periods" class="input" type="number"></div></div>
      <div v-else-if="modal === 'dueDate'"><div class="field"><div class="label">首期还款日<span class="req">*</span></div><input v-model="edit.firstDueDate" class="input" type="date"></div><div class="field"><div class="label">修改原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea" placeholder="请填写修改还款日的原因"></textarea></div></div>
      <div v-else-if="modal === 'payee'"><div class="field"><div class="label">收款人姓名<span class="req">*</span></div><input v-model="edit.name" class="input"></div><div class="field"><div class="label">收款账号<span class="req">*</span></div><input v-model="edit.account" class="input mono"></div><div class="field"><div class="label">收款二维码（选填）</div><input type="file" accept="image/*" class="input" @change="event => { const file = event.target.files?.[0]; if (file) { edit.payeeQrFile = file; edit.payeeQrUrl = URL.createObjectURL(file) } }"><img v-if="edit.payeeQrUrl || payeeQr" :src="edit.payeeQrUrl || payeeQr" alt="收款二维码" style="width:140px;height:140px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;margin-top:8px"></div></div>
      <div v-else-if="modal === 'mdm'"><div class="alert info mb12">本系统仅保存监管锁序列号记录，不连接 MDM 平台接口。</div><div class="field"><div class="label">监管锁序列号<span class="req">*</span></div><input v-model="edit.serial" class="input mono" placeholder="准富后台显示的序列号"></div></div>
      <div v-else-if="modal === 'unbind'"><div class="alert warn mb12">解绑结果会写入订单日志，原因必填。</div><div class="field"><div class="label">解绑原因<span class="req">*</span></div><textarea v-model="edit.note" class="textarea" placeholder="例如 设备退货 / 序列号登记错误"></textarea></div></div>
      <div v-else-if="modal === 'signOk'"><div class="alert warn mb12"><span>演示签约</span><span>仅模拟成功结果，不创建真实合同。</span></div><div class="field"><div class="label">演示签约编号<span class="req">*</span></div><input v-model="edit.contractNo" class="input mono" placeholder="例如 MOCK-SIGN-001"></div></div>
      <div v-else-if="modal === 'signFail'"><div class="alert warn mb12">仅模拟失败结果，用于验证退回与重试流程。</div><div class="field"><div class="label">演示失败原因<span class="req">*</span></div><textarea v-model="edit.reason" class="textarea"></textarea></div></div>
      <div v-else-if="modal === 'payout'"><div class="alert info mb12">请确认已在银行软件完成打款。</div><div class="field"><div class="label">银行回单号 / 交易号<span class="req">*</span></div><input v-model="edit.ref" class="input mono" placeholder="例如 VCB-20261121-0034"></div></div>
      <div v-else-if="modal === 'finance'"><div class="field"><div class="label">财务备注</div><textarea v-model="edit.note" class="textarea" placeholder="选填"></textarea></div></div>
      <div v-else><div class="field"><div class="label">{{ modal === 'cancel' ? '取消原因' : '备注内容' }}<span class="req">*</span></div><textarea v-model="edit.note" class="textarea" :placeholder="modal === 'cancel' ? '请填写取消订单的原因' : '例如：已电话联系客户，明日补交流水'"></textarea></div></div>
      <template #footer><button class="btn" :disabled="busy" @click="modal = ''">取消</button><button class="btn" :class="['cancel','signFail'].includes(modal) ? 'danger' : 'primary'" :disabled="busy" @click="saveModal">{{ busy ? '提交中…' : '确认' }}</button></template>
    </BaseModal>
  </AppShell>
</template>
