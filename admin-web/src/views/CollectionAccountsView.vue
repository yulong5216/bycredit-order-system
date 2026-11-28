<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import BaseModal from '../components/BaseModal.vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { dateText } from '../utils/format'
import { toast } from '../utils/feedback'

const auth = useAuthStore()
const loading = ref(true)
const busy = ref(false)
const accounts = ref([])
const history = ref([])
const modal = ref('') // 'form' | 'switch'
const current = ref(null) // 今天生效的账号
const form = reactive({ bank: '', account: '', holder: '', branch: '', note: '' })
const switchForm = reactive({ payeeAccountId: '', date: todayStr(), remark: '' })

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  try {
    const [a, h, c] = await Promise.all([
      api.listPayeeAccounts(),
      api.payeeAccountHistory({ size: 15 }),
      api.currentPayeeAccount()
    ])
    accounts.value = a.items || []
    history.value = h.items || []
    current.value = c.ok ? c.config.payeeAccount : null
  } catch (e) { toast(e.message, 'err') } finally { loading.value = false }
}

function clearForm() { Object.assign(form, { bank: '', account: '', holder: '', branch: '', note: '' }) }

function openForm(acc = null) {
  modal.value = 'form'
  if (acc) {
    current.value = acc
    Object.assign(form, { bank: acc.bank, account: acc.account, holder: acc.holder, branch: acc.branch || '', note: acc.note || '' })
  } else {
    current.value = null
    clearForm()
  }
}

function openSwitch() {
  modal.value = 'switch'
  switchForm.payeeAccountId = current.value?.id || accounts.value[0]?.id || ''
  switchForm.date = todayStr()
  switchForm.remark = ''
}

async function submitForm() {
  if (!form.bank || !form.account || !form.holder) return toast('银行/账号/开户人必填', 'err')
  busy.value = true
  try {
    if (current.value && current.value.id) {
      await api.updatePayeeAccount(current.value.id, form)
      toast('已更新')
    } else {
      await api.createPayeeAccount(form)
      toast('已添加')
    }
    modal.value = ''
    await load()
  } catch (e) { toast(e.message, 'err') } finally { busy.value = false }
}

async function remove(acc) {
  if (!confirm(`删除收款账号 ${acc.bank} ${acc.account}？`)) return
  busy.value = true
  try {
    await api.deletePayeeAccount(acc.id)
    toast('已删除')
    await load()
  } catch (e) { toast(e.message, 'err') } finally { busy.value = false }
}

async function submitSwitch() {
  if (!switchForm.payeeAccountId) return toast('请选一个收款账号', 'err')
  busy.value = true
  try {
    await api.switchPayeeAccount(switchForm.payeeAccountId, switchForm.date, switchForm.remark)
    toast('已切换今天的收款账号')
    modal.value = ''
    await load()
  } catch (e) { toast(e.message, 'err') } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="page">
      <div class="page-head">
        <h1>收款账号配置</h1>
        <div class="page-sub">
          给客户生成还款二维码时，系统会自动用<span class="current-tag">今天生效的收款账号</span>
        </div>
      </div>

      <!-- 今天生效的收款账号 -->
      <div class="current-card">
        <div class="current-label">今天的主力收款账号</div>
        <div v-if="current" class="current-info">
          <div class="current-main">
            <span class="bank-badge">{{ current.bank }}</span>
            <span class="mono">{{ current.account }}</span>
            <span class="faint small">{{ current.holder }}</span>
          </div>
          <button class="btn primary" @click="openSwitch">切换</button>
        </div>
        <div v-else class="current-empty">
          ⚠️ 还没选今天的收款账号 —— 点右边按钮选一个
          <button class="btn primary" style="margin-left:auto" @click="openSwitch">选一下</button>
        </div>
      </div>

      <!-- 账号列表 -->
      <div class="card">
        <div class="card-head">
          <div class="card-title">所有收款账号</div>
          <button v-if="auth.can('collection-config:manage')" class="btn primary" @click="openForm()">+ 添加账号</button>
        </div>
        <div v-if="loading" class="loading">加载中…</div>
        <div v-else-if="!accounts.length" class="empty">还没添加任何收款账号</div>
        <div v-else class="accounts">
          <div v-for="a in accounts" :key="a.id" class="acc-row">
            <div class="acc-main">
              <span class="bank-badge">{{ a.bank }}</span>
              <span class="mono acc-account">{{ a.account }}</span>
              <span class="acc-holder faint small">{{ a.holder }}</span>
            </div>
            <div class="acc-right">
              <span v-if="current && current.id === a.id" class="current-mark">今天用这个</span>
              <button v-if="auth.can('collection-config:manage')" class="btn ghost" @click="openForm(a)">编辑</button>
              <button v-if="auth.can('collection-config:manage')" class="btn ghost danger" @click="remove(a)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 历史切换 -->
      <div v-if="history.length" class="card">
        <div class="card-title small">最近切换历史</div>
        <table class="table">
          <thead>
            <tr><th>日期</th><th>银行</th><th>账号</th><th>备注</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>{{ dateText(h.date) }}</td>
              <td>{{ h.payeeAccount?.bank }}</td>
              <td class="mono">{{ h.payeeAccount?.account }}</td>
              <td class="faint small">{{ h.remark || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 表单 Modal -->
    <BaseModal v-if="modal === 'form'" :title="current ? '编辑收款账号' : '新增收款账号'" width="480" @close="modal = ''">
      <div class="modal-body">
        <div class="field"><label class="label">银行 <span class="req">*</span></label><input v-model="form.bank" class="input" placeholder="Vietcombank / TPBank / VietinBank"></div>
        <div class="field"><label class="label">银行账号 <span class="req">*</span></label><input v-model="form.account" class="input mono" placeholder="0071000999888"></div>
        <div class="field"><label class="label">开户人 <span class="req">*</span></label><input v-model="form.holder" class="input" placeholder="CONG TY BY DN"></div>
        <div class="field"><label class="label">开户支行（可选）</label><input v-model="form.branch" class="input" placeholder="HANOI"></div>
        <div class="field"><label class="label">备注（可选）</label><input v-model="form.note" class="input" placeholder="主力收款 / 备用 / 老账号"></div>
      </div>
      <template #footer>
        <div class="modal-foot">
          <button class="btn ghost" @click="modal = ''">取消</button>
          <button class="btn primary" @click="submitForm" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
        </div>
      </template>
    </BaseModal>

    <!-- 切号 Modal -->
    <BaseModal v-if="modal === 'switch'" title="切换今天的收款账号" width="420" @close="modal = ''">
      <div class="modal-body">
        <div class="hint">选好之后，今天所有客户生成的还款二维码都会带你选的这个账号。</div>
        <div class="field">
          <label class="label">日期</label>
          <input v-model="switchForm.date" class="input" type="date">
        </div>
        <div class="field">
          <label class="label">收款账号 <span class="req">*</span></label>
          <select v-model="switchForm.payeeAccountId" class="input">
            <option value="">请选一个…</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.bank }} · {{ a.account }} · {{ a.holder }}</option>
          </select>
        </div>
        <div class="field">
          <label class="label">备注（可选）</label>
          <input v-model="switchForm.remark" class="input" placeholder="今天主力用这个">
        </div>
      </div>
      <template #footer>
        <div class="modal-foot">
          <button class="btn ghost" @click="modal = ''">取消</button>
          <button class="btn primary" @click="submitSwitch" :disabled="busy">确认切换</button>
        </div>
      </template>
    </BaseModal>
  </AppShell>
</template>

<style scoped>
.page { max-width: 960px }
.page-head { margin-bottom: 20px }
.page-head h1 { margin: 0; font-size: 22px }
.page-sub { margin-top: 4px; font-size: 13px; color: #64748B }
.current-tag { background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px }

.current-card { background: linear-gradient(135deg,#EFF6FF,#fff); border: 1px solid #BFDBFE; border-radius: 14px; padding: 18px 20px; margin-bottom: 20px }
.current-label { font-size: 12px; font-weight: 600; color: #1D4ED8; margin-bottom: 10px; letter-spacing: .5px }
.current-info { display: flex; align-items: center; gap: 16px; justify-content: space-between }
.current-main { display: flex; align-items: center; gap: 12px; font-size: 15px }
.current-empty { display: flex; align-items: center; color: #D97706; font-size: 14px; font-weight: 500 }

.bank-badge { background: #1E40AF; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600 }
.mono { font-family: 'SF Mono', Menlo, Consolas, monospace }
.faint { color: #94A3B8 }
.small { font-size: 12.5px }
.req { color: #D92D20 }

.card { background: #fff; border: 1px solid #E5E9F2; border-radius: 12px; padding: 18px; margin-bottom: 16px }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px }
.card-title { font-size: 15px; font-weight: 600; color: #0F1B2D }
.card-title.small { font-size: 13px; margin-bottom: 10px }

.loading, .empty { padding: 30px; text-align: center; color: #94A3B8; font-size: 13px }

.accounts { display: flex; flex-direction: column; gap: 6px }
.acc-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border: 1px solid #E5E9F2; border-radius: 10px; transition: all .15s }
.acc-row:hover { border-color: #BFDBFE; background: #F8FAFF }
.acc-main { display: flex; align-items: center; gap: 12px }
.acc-account { color: #0F1B2D; font-weight: 600 }
.acc-holder { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.acc-right { display: flex; align-items: center; gap: 8px }
.current-mark { background: #DCFCE7; color: #15803D; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-right: 6px }

.hint { background: #FEF9C3; color: #A16207; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 14px; border: 1px solid #FDE68A }

.btn { padding: 6px 14px; border-radius: 8px; border: 1px solid #E5E9F2; background: #fff; font-size: 13px; cursor: pointer; color: #0F1B2D; transition: all .15s }
.btn:hover:not(:disabled) { border-color: #94A3B8 }
.btn.primary { background: #155EEF; border-color: #155EEF; color: #fff }
.btn.primary:hover:not(:disabled) { background: #0B4BD6; border-color: #0B4BD6 }
.btn.ghost { background: transparent; border-color: transparent; color: #64748B; padding: 4px 10px }
.btn.ghost:hover { background: #F1F5F9 }
.btn.ghost.danger:hover { color: #D92D20; background: #FEF2F2 }
.btn:disabled { opacity: .5; cursor: not-allowed }

.table { width: 100%; border-collapse: collapse; font-size: 13px }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #F1F5F9 }
.table th { color: #64748B; font-weight: 600; font-size: 12px; background: #F8FAFC }
.table tr:hover { background: #FAFBFC }

.field { margin-bottom: 12px }
.label { display: block; font-size: 13px; font-weight: 500; color: #334155; margin-bottom: 6px }
.input { width: 100%; padding: 8px 12px; border: 1px solid #E5E9F2; border-radius: 8px; font-size: 14px; background: #fff; box-sizing: border-box; font-family: inherit }
.input:focus { outline: none; border-color: #155EEF; box-shadow: 0 0 0 3px rgba(21,94,239,.1) }

.modal-body { padding: 8px 0 }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid #F1F5F9 }
</style>
