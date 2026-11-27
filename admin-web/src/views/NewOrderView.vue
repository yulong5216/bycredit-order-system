<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { DOC_TYPES, money, todayPlus, unwrapList } from '../utils/format'
import { toast } from '../utils/feedback'

const router = useRouter()
const auth = useAuthStore()
const busy = ref(false)
const stores = ref([])
const agree = ref(false)
const models = ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max', 'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max', 'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max', 'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro Max', 'iPhone 16', 'iPhone 16 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Pro Max']
const pasteSource = ref('')
const parseNotice = ref('')
const relations = ['Bố mẹ / 父母', 'Vợ / Chồng / 配偶', 'Anh chị em / 兄弟姐妹', 'Bạn bè / 朋友', 'Khác / 其他']
const form = reactive({
  customer: { name: '', idType: 'CCCD', idNo: '', phone: '', birthDate: '', gender: '', address: '', currentAddress: '', workCompany: '', workPhone: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '', secondName: '', secondPhone: '' },
  docs: {},
  device: { model: '', capacity: '128G', color: '', imei: '', screenType: 'original', checks: { mdm: true, sim: true, faceid: true } },
  plan: { price: '', perPeriod: '', periods: 6, firstDueDate: todayPlus(), storeId: '', salesId: auth.user?.id || '', salesName: auth.displayName },
  payee: { name: '', account: '', qrFile: null, qrUrl: '' }
})
const idMax = computed(() => form.customer.idType === 'CCCD' ? 12 : form.customer.idType === 'CMND' ? 9 : 20)
const currentStore = computed(() => stores.value.find(s => String(s.id) === String(form.plan.storeId)))
const docCount = computed(() => DOC_TYPES.filter(d => form.docs[d.key]).length)
const totalRepay = computed(() => (Number(form.plan.perPeriod) || 0) * (Number(form.plan.periods) || 0))
const profitTotal = computed(() => Math.max(0, totalRepay.value - (Number(form.plan.price) || 0)))
const checks = [['mdm', '无 MDM 监管锁'], ['sim', '无 SIM / 运营商锁'], ['faceid', 'Face ID / 指纹正常']]

const LABELS = {
  客户名字: 'name', 客户姓名: 'name', 姓名: 'name', 名字: 'name',
  手机号: 'phone', 电话: 'phone', 联系电话: 'phone', 客户电话: 'phone',
  证件类型: 'idType', 证件号: 'idNo', 证件号码: 'idNo', cccd: 'idNo', cmnd: 'idNo',
  出生日期: 'birthDate', 性别: 'gender', 常住地址: 'address', 住址: 'address', 地址: 'address',
  现住地址: 'currentAddress', 工作单位: 'workCompany', 工作电话: 'workPhone',
  紧急联系人: 'emergencyName', 关系: 'emergencyRelation', 联系人电话: 'emergencyPhone',
  第二联系人: 'secondName', 第二联系人电话: 'secondPhone',
  手机型号: 'device', 机型: 'device', 设备: 'device', 产品型号: 'device',
  imei: 'imei', 串码: 'imei',
  分期: 'price', 分期额: 'price', 分期金额: 'price', 放款金额: 'price', 放款: 'price', 贷款金额: 'price',
  期限: 'periods', 期数: 'periods', 分期期数: 'periods',
  每期: 'perPeriod', 每期金额: 'perPeriod', 每期还款: 'perPeriod', 月供: 'perPeriod',
  客户首付: 'downPayment', 首付: 'downPayment', 首付款: 'downPayment',
  店铺: 'store', 门店: 'store', 店名: 'store',
  收款账户名: 'payeeName', 收款账户名称: 'payeeName', 收款人: 'payeeName', 户名: 'payeeName', 收款人姓名: 'payeeName',
  收款账户: 'payeeAccount', 收款账号: 'payeeAccount', 账号: 'payeeAccount', 银行卡号: 'payeeAccount', 银行账号: 'payeeAccount'
}

function parsedDate(value) {
  let match = value.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (!match) match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : value
}
function onlyDigits(value) {
  return String(value ?? '').replace(/[^\d]/g, '')
}
function parseDevice(raw) {
  const source = String(raw || '').trim()
  const compact = source.toLowerCase().replace(/\d+\s*(?:gb|g)\b|1\s*tb/g, '').replace(/[\s\-_/]/g, '')
  const capacity = source.match(/(\d+)\s*(?:gb|g)\b/i) || source.match(/1\s*tb/i)
  const match = compact.match(/iphone(\d{1,2})(promax|pro|plus|mini)?/)
  if (!match) return { model: source, capacity: '' }
  const suffix = { promax: 'Pro Max', pro: 'Pro', plus: 'Plus', mini: 'Mini' }[match[2]] || ''
  return {
    model: `iPhone ${match[1]}${suffix ? ` ${suffix}` : ''}`,
    capacity: capacity ? (capacity[1] ? `${capacity[1]}G` : '1TB') : ''
  }
}
function matchStore(name) {
  const target = String(name || '').trim().toLowerCase()
  if (!target) return false
  const store = stores.value.find(s => s.name.trim().toLowerCase() === target) ||
    stores.value.find(s => s.name.toLowerCase().includes(target) || target.includes(s.name.toLowerCase()))
  if (!store) return false
  selectStore(String(store.id))
  return true
}
function parseSource() {
  const text = pasteSource.value.trim()
  if (!text) return toast('请先粘贴客户资料或群消息', 'err')
  let filled = 0
  let downPaymentSkipped = false
  let storeName = ''
  const parsed = { price: 0, periods: 0, perPeriod: 0 }
  const set = (key, value) => {
    form.customer[key] = value
    filled++
  }
  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/^[^\p{L}\p{N}]+/u, '').trim()
    if (!line) return
    const separator = line.search(/[:：]/)
    if (separator < 0) {
      const parts = line.split('|').map(item => item.trim())
      if (parts.length === 7) {
        set('idType', 'CCCD')
        set('idNo', onlyDigits(parts[0]).slice(0, 12))
        set('name', parts[2])
        set('birthDate', parsedDate(parts[3]))
        set('gender', parts[4])
        set('address', parts[5])
      }
      return
    }
    const label = line.slice(0, separator).replace(/[\s*＊]/g, '').toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (!value) return
    const key = LABELS[label]
    if (!key) return
    if (key === 'name') set('name', value)
    else if (key === 'phone') set('phone', onlyDigits(value).slice(0, 11))
    else if (key === 'idType') set('idType', /护照|passport/i.test(value) ? '护照' : (/CMND/i.test(value) ? 'CMND' : 'CCCD'))
    else if (key === 'idNo') set('idNo', /护照|passport/i.test(form.customer.idType) ? value : onlyDigits(value).slice(0, idMax.value))
    else if (key === 'birthDate') set('birthDate', parsedDate(value))
    else if (key === 'gender') set('gender', value)
    else if (key === 'address') set('address', value)
    else if (key === 'currentAddress') set('currentAddress', value)
    else if (key === 'workCompany') set('workCompany', value)
    else if (key === 'workPhone') set('workPhone', onlyDigits(value).slice(0, 11))
    else if (key === 'emergencyName') set('emergencyName', value)
    else if (key === 'emergencyRelation') set('emergencyRelation', relations.find(item => item === value || item.split(' / ').includes(value)) || value)
    else if (key === 'emergencyPhone') set('emergencyPhone', onlyDigits(value).slice(0, 11))
    else if (key === 'secondName') set('secondName', value)
    else if (key === 'secondPhone') set('secondPhone', onlyDigits(value).slice(0, 11))
    else if (key === 'device') {
      const device = parseDevice(value)
      if (device.model) { form.device.model = device.model; filled++ }
      if (device.capacity) { form.device.capacity = device.capacity; filled++ }
    } else if (key === 'imei') { form.device.imei = onlyDigits(value).slice(0, 15); filled++ }
    else if (key === 'price') { parsed.price = Number(onlyDigits(value)); form.plan.price = String(parsed.price); filled++ }
    else if (key === 'periods') { parsed.periods = Number(onlyDigits(value)); form.plan.periods = parsed.periods || form.plan.periods; filled++ }
    else if (key === 'perPeriod') { parsed.perPeriod = Number(onlyDigits(value)); form.plan.perPeriod = String(parsed.perPeriod); filled++ }
    else if (key === 'downPayment') { downPaymentSkipped = true }
    else if (key === 'store') { storeName = value; filled++ }
    else if (key === 'payeeName') { form.payee.name = value; filled++ }
    else if (key === 'payeeAccount') { form.payee.account = onlyDigits(value); filled++ }
  })
  let storeMatched = false
  if (storeName) storeMatched = matchStore(storeName)
  if (!filled) return toast('未识别到可填入的内容，请按「标签：内容」每行一条粘贴', 'err')
  parseNotice.value = `已解析 ${filled} 项${storeName ? (storeMatched ? `，门店已匹配「${currentStore.value?.name}」` : `，未找到门店「${storeName}」请手动选择`) : ''}${downPaymentSkipped ? '，首付按 0 处理' : ''}，请核对后提交。`
  toast(parseNotice.value)
}

async function loadStores() {
  try {
    const data = await api.listStores({ size: 1000 })
    stores.value = unwrapList(data).items.filter(s => !['冻结', '暂停', 'frozen', 'disabled'].includes(s.status))
    if (stores.value.length && !form.plan.storeId) selectStore(String(stores.value[0].id))
  } catch (error) { toast(error.message, 'err') }
}
function selectStore(id) {
  form.plan.storeId = id
  const store = stores.value.find(s => String(s.id) === String(id))
  if (store?.payee) form.payee = { ...form.payee, name: store.payee.holder || store.payee.name || '', account: store.payee.account || '' }
}
function onImeiPaste(event) {
  const text = event.clipboardData?.getData('text') || ''
  const match = text.match(/\d{15}/) || text.replace(/\D/g, '').match(/\d{15}/)
  if (!match) return
  event.preventDefault()
  form.device.imei = match[0]
}
function payeeQrChanged(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return toast('请上传二维码图片', 'err')
  if (form.payee.qrUrl) URL.revokeObjectURL(form.payee.qrUrl)
  form.payee.qrFile = file
  form.payee.qrUrl = URL.createObjectURL(file)
}
function onDigits(target, key, max, event) {
  const value = event.target.value.replace(/\D/g, '').slice(0, max)
  target[key] = value
  event.target.value = value
}
function onIdNo(event) {
  if (form.customer.idType === '护照') return
  onDigits(form.customer, 'idNo', idMax.value, event)
}
function fileChanged(key, event) {
  const file = event.target.files?.[0]
  if (file) form.docs[key] = { name: file.name, size: file.size, type: file.type, at: new Date().toISOString(), file }
  else delete form.docs[key]
}
function validate() {
  const c = form.customer
  if (!c.name.trim()) return '请填写客户姓名'
  if (!c.idNo.trim()) return '请填写证件号码'
  if (!c.phone) return '请填写联系电话'
  if (!c.address.trim()) return '请填写常住地址'
  if (!c.emergencyName.trim() || !c.emergencyRelation || !c.emergencyPhone) return '请完整填写紧急联系人信息'
  if (c.emergencyPhone === c.phone) return '紧急联系人不能与客户本人号码相同'
  if (!form.device.model.trim()) return '请填写机型'
  if (form.device.imei.replace(/\D/g, '').length < 10) return '请填写正确 IMEI'
  if (!form.plan.storeId) return '请选择门店'
  if (!Number(form.plan.price)) return '请填写分期额'
  if (!Number(form.plan.periods)) return '请填写期数'
  if (!(Number(form.plan.perPeriod) > 0)) return '请填写每期还款额'
  if (!form.payee.name.trim() || !form.payee.account.trim()) return '请完整填写门店收款信息'
  if (!agree.value) return '请确认客户已阅读并同意分期服务协议'
  return ''
}
async function submit() {
  const error = validate()
  if (error || busy.value) return error && toast(error, 'err')
  busy.value = true
  let draftId = ''
  try {
    const payload = JSON.parse(JSON.stringify({
      ...form,
      docs: {},
      payee: { name: form.payee.name, account: form.payee.account },
      plan: { ...form.plan, perPeriod: Number(form.plan.perPeriod), storeName: currentStore.value?.name || '' }
    }))
    const created = await api.createOrder(payload)
    const order = created.order || created
    const id = order.id || order._id
    if (!id) throw new Error('录单成功，但响应中缺少订单 ID')
    draftId = id
    if (form.payee.qrFile) await api.uploadDoc(id, 'payee_qr', form.payee.qrFile)
    for (const [key, doc] of Object.entries(form.docs)) {
      if (doc.file) await api.uploadDoc(id, key, doc.file)
    }
    await api.submitOrder(id)
    toast('录单已提交，待初审')
    router.replace(`/orders/${id}`)
  } catch (error) {
    if (draftId) {
      toast(`草稿已保存，请继续补传资料：${error.message}`, 'err')
      router.replace(`/orders/${draftId}`)
    } else toast(error.message, 'err')
  } finally { busy.value = false }
}
onMounted(loadStores)
</script>

<template>
  <div class="mobile-body desktop-new-order">
    <div class="app">
      <header class="m-top">
        <RouterLink class="btn sm ghost" to="/orders">取消</RouterLink>
        <div class="grow" style="text-align:center"><div class="m-title" style="font-size:15px">新建录单</div><div class="m-sub">粘贴解析 · 一页录入</div></div><span style="width:38px"></span>
      </header>
      <div class="m-body">
        <div class="m-card" style="padding:16px;border:1px solid #cfd9ea;background:linear-gradient(180deg,#f4f8ff,#fff)">
          <div class="row-between mb12"><div class="section-title" style="margin:0">粘贴群消息自动解析</div><span class="pill blue">第一步</span></div>
          <textarea v-model="pasteSource" class="textarea" style="min-height:170px" placeholder="客户名字 : Hoàng Văn Mạnh&#10;手机型号 : iphone 14promax-128gb&#10;分期       : 8.300.000&#10;期限         : 3&#10;每期         : 3.306.167&#10;客户首付：8.300.000&#10;店铺         : Táo Hà Nội&#10;收款账户名：HO KINH DOANH TAO HA NOI&#10;收款账户：102887285193"></textarea>
          <button type="button" class="btn primary block mt8" @click="parseSource">解析并填入下方表单</button>
          <div class="hint mt8">支持标签：客户名字 / 手机号 / 证件号 / 手机型号 / IMEI / 分期 / 期限 / 每期 / 店铺 / 收款账户名 / 收款账户。冒号支持中英文，金额可带点号千分位；首付按 0 处理。</div>
          <div v-if="parseNotice" class="alert info mt12"><span>核对</span><span>{{ parseNotice }}</span></div>
        </div>

        <div class="m-card" style="padding:16px">
          <div class="section-title">客户身份</div>
          <div class="field"><div class="label">客户姓名<span class="req">*</span></div><input v-model="form.customer.name" class="input" placeholder="与证件一致"></div>
          <div class="field"><div class="label">联系电话<span class="req">*</span></div><input v-model="form.customer.phone" class="input" type="tel" inputmode="numeric" placeholder="最多 11 位数字" @input="onDigits(form.customer, 'phone', 11, $event)"></div>
          <div class="field"><div class="label">证件号码<span class="req">*</span></div><input v-model="form.customer.idNo" class="input mono" :inputmode="form.customer.idType === '护照' ? 'text' : 'numeric'" placeholder="CCCD 为 12 位数字" @input="onIdNo"></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:0 10px"><div class="field"><div class="label">出生日期</div><input v-model="form.customer.birthDate" class="input" type="date"></div><div class="field"><div class="label">性别</div><input v-model="form.customer.gender" class="input" placeholder="Nam / Nữ"></div></div>
          <div class="field"><div class="label">常住地址<span class="req">*</span></div><textarea v-model="form.customer.address" class="textarea" placeholder="省 / 市 / 郡 / 坊 / 门牌号"></textarea></div>
          <div class="field"><div class="label">现住地址</div><textarea v-model="form.customer.currentAddress" class="textarea" placeholder="与常住地址不同时填写"></textarea></div>
          <div class="divider"></div><div class="section-title">工作信息（非必填）</div>
          <div class="field"><div class="label">工作单位</div><input v-model="form.customer.workCompany" class="input"></div>
          <div class="field"><div class="label">工作电话</div><input v-model="form.customer.workPhone" class="input" type="tel" inputmode="numeric" @input="onDigits(form.customer, 'workPhone', 11, $event)"></div>
          <div class="divider"></div><div class="section-title">紧急联系人</div>
          <div class="field"><div class="label">联系人姓名<span class="req">*</span></div><input v-model="form.customer.emergencyName" class="input" placeholder="不允许填写客户本人"></div>
          <div class="field"><div class="label">与客户关系<span class="req">*</span></div><select v-model="form.customer.emergencyRelation" class="select"><option value="">请选择</option><option v-for="item in relations" :key="item">{{ item }}</option></select></div>
          <div class="field"><div class="label">联系人电话<span class="req">*</span></div><input v-model="form.customer.emergencyPhone" class="input" type="tel" inputmode="numeric" @input="onDigits(form.customer, 'emergencyPhone', 11, $event)"></div>
          <div class="field"><div class="label">第二联系人（非必填）</div><input v-model="form.customer.secondName" class="input"></div>
          <div class="field"><div class="label">第二联系人电话</div><input v-model="form.customer.secondPhone" class="input" type="tel" inputmode="numeric" @input="onDigits(form.customer, 'secondPhone', 11, $event)"></div>
        </div>

        <div class="m-card">
          <div class="section-title">设备信息</div>
          <div class="field"><div class="label">机型<span class="req">*</span></div><input v-model="form.device.model" class="input" list="device-models" placeholder="如 iPhone 14 Pro Max"><datalist id="device-models"><option v-for="model in models" :key="model" :value="model"></option></datalist></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:0 10px"><div class="field"><div class="label">容量</div><select v-model="form.device.capacity" class="select"><option>64G</option><option>128G</option><option>256G</option><option>512G</option><option>1TB</option></select></div><div class="field"><div class="label">颜色</div><input v-model="form.device.color" class="input" placeholder="如 Đen / Trắng"></div></div>
          <div class="field"><div class="label">卡槽 1 IMEI<span class="req">*</span></div><input v-model="form.device.imei" class="input mono" inputmode="numeric" placeholder="15 位数字" @paste="onImeiPaste"><div class="hint mt8">iPhone 拨号输入 *#06# 查看；如能复制结果可直接粘贴，粘贴内容会自动提取 15 位数字。</div></div>
          <div class="divider"></div>
          <div class="section-title">验机问卷</div>
          <div class="field"><div class="label">屏幕类型<span class="req">*</span></div><div class="radio-grid"><button type="button" class="radio-card" :class="{ on: form.device.screenType === 'original' }" @click="form.device.screenType = 'original'">原装屏</button><button type="button" class="radio-card" :class="{ on: form.device.screenType === 'third_party' }" @click="form.device.screenType = 'third_party'">非原装屏</button></div></div>
          <div class="checklist"><label v-for="check in checks" :key="check[0]" class="check" :class="form.device.checks[check[0]] ? 'on' : 'blocked'"><input v-model="form.device.checks[check[0]]" type="checkbox"><div><div class="k">{{ check[1] }}</div></div></label></div>
        </div>

        <div class="m-card">
          <div class="section-title">分期方案</div>
          <div class="field"><div class="label">分期额（₫）<span class="req">*</span></div><input v-model="form.plan.price" class="input" type="number" min="0" step="1" placeholder="如 8300000"></div>
          <div class="field"><div class="label">每期还款额（₫）<span class="req">*</span></div><input v-model="form.plan.perPeriod" class="input" type="number" min="0" step="1" placeholder="如 3306167"></div>
          <div class="field"><div class="label">期数<span class="req">*</span></div><div class="radio-grid"><button v-for="n in [3,4,6,9,12]" :key="n" type="button" class="radio-card" :class="{ on: Number(form.plan.periods) === n }" @click="form.plan.periods = n">{{ n }} 期</button></div></div>
        </div>

        <div class="m-card">
          <div class="section-title">归属信息</div>
          <div class="field"><div class="label">门店<span class="req">*</span></div><select class="select" :value="form.plan.storeId" @change="selectStore($event.target.value)"><option v-for="store in stores" :key="store.id" :value="String(store.id)">{{ store.name }}</option></select></div>
          <div class="field"><div class="label">业务员</div><input :value="form.plan.salesName || auth.displayName" class="input" readonly disabled style="background:#f5f7fa;color:#666"></div>
        </div>

        <div class="m-card">
          <div class="section-title">门店收款信息</div>
          <div class="small muted mb12">默认带出门店管理里的收款账户；如群消息有不同，粘贴后覆盖。财务会同时看到门店默认与本次录入。</div>
          <div class="field"><div class="label">收款人姓名<span class="req">*</span></div><input v-model="form.payee.name" class="input"></div>
          <div class="field"><div class="label">收款账号<span class="req">*</span></div><input v-model="form.payee.account" class="input mono"></div>
          <div class="upload-grid" style="grid-template-columns:1fr"><label class="upload-tile" :class="{ done: form.payee.qrUrl }"><img v-if="form.payee.qrUrl" :src="form.payee.qrUrl" alt="收款二维码" style="width:100%;height:100%;object-fit:contain"><template v-else><div class="plus">+</div><div>收款二维码</div><div class="small">拍照或上传门店收款码</div></template><input type="file" class="hide" accept="image/*" capture="environment" @change="payeeQrChanged"></label></div>
        </div>

        <div class="m-card">
          <div class="row-between mb12"><div class="section-title" style="margin:0">影像资料</div><span class="pill" :class="docCount ? 'green' : 'gray'">{{ docCount }} / {{ DOC_TYPES.length }} 项（选填）</span></div>
          <div class="upload-grid"><label v-for="doc in DOC_TYPES" :key="doc.key" class="upload-tile" :class="{ done: form.docs[doc.key] }"><div class="plus">{{ form.docs[doc.key] ? '✓' : '+' }}</div><div>{{ doc.label }}</div><div class="small">{{ form.docs[doc.key]?.name || '选择文件' }}</div><input type="file" class="hide" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" @change="fileChanged(doc.key, $event)"></label></div>
          <div class="alert info mt12"><span>资料</span><span>资料均为选填，可先提交后补传；请上传真实采集的证件、证明及照片，系统不会生成或伪造影像。</span></div>
        </div>

        <div class="m-card">
          <div class="section-title">核对与提交</div>
          <div class="kv" style="grid-template-columns:86px 1fr"><div class="kv-k">客户</div><div class="kv-v">{{ form.customer.name }} · {{ form.customer.phone }}</div><div class="kv-k">证件号</div><div class="kv-v mono">{{ form.customer.idNo }}</div><div class="kv-k">常住地址</div><div class="kv-v">{{ form.customer.address }}</div><div class="kv-k">紧急联系人</div><div class="kv-v">{{ form.customer.emergencyName }} · {{ form.customer.emergencyPhone }}</div><div class="kv-k">设备</div><div class="kv-v">{{ form.device.model }} {{ form.device.capacity }} {{ form.device.color }}</div><div class="kv-k">IMEI</div><div class="kv-v mono">{{ form.device.imei }}</div><div class="kv-k">门店 / 业务员</div><div class="kv-v">{{ currentStore?.name }} · {{ form.plan.salesName || auth.displayName }}</div><div class="kv-k">分期</div><div class="kv-v">{{ money(form.plan.price) }} · {{ form.plan.periods }} 期</div><div class="kv-k">每期 / 总额</div><div class="kv-v">{{ money(form.plan.perPeriod) }} / {{ money(totalRepay) }}</div><div class="kv-k">收款信息</div><div class="kv-v">{{ form.payee.name }}<br>{{ form.payee.account }}<br>{{ form.payee.qrUrl ? '已上传收款二维码' : '未上传收款二维码' }}</div><div class="kv-k">资料</div><div class="kv-v">{{ docCount }} / {{ DOC_TYPES.length }} 项已选择（非必填）</div></div>
        </div>

        <label class="check" :class="{ on: agree }" style="background:#fff"><input v-model="agree" type="checkbox"><div><div class="k">客户已阅读并同意分期服务协议</div><div class="d">提交后进入初审，资料齐全一般当天出结果</div></div></label>
      </div>
      <div class="m-foot"><button class="btn primary" :disabled="busy" @click="submit">{{ busy ? '提交中…' : '提交初审' }}</button></div>
    </div>
  </div>
</template>
