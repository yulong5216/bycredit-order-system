export const ORDER_STATUS = {
  draft: ['草稿', 'gray'], pending_first: ['待初审', 'amber'], rejected_first: ['初审驳回', 'red'],
  pending_customer_sign: ['待客户签约', 'purple'], pending_final: ['待终审', 'blue'],
  rejected_final: ['终审驳回', 'red'], approved_final: ['终审通过 · 待送财务', 'purple'],
  pending_finance: ['待财务审核', 'amber'], pending_payout: ['待放款', 'blue'],
  repaying: ['还款中', 'green'], overdue: ['逾期', 'red'], breach: ['坏账', 'red'],
  closed: ['已结清', 'gray'], cancelled: ['已取消', 'gray']
}

export const BILL_STATUS = {
  Pending: ['待还', 'gray'], Paid: ['已还', 'green'], Deferred: ['已延期', 'amber'],
  Overdue: ['逾期', 'red'], Breach: ['坏账', 'red'], Settled: ['已结清', 'gray']
}

export const DOC_TYPES = [
  ['id_front', '身份证正面'], ['id_back', '身份证反面'], ['selfie', '手持身份证照'],
  ['work_proof', '工作证明'], ['bank_statement', '银行流水'],
  ['staff_customer_photo', '员工与客户合影'], ['phone_verify', '手机号实名满半年'],
  ['imei_photo', '手机串码实拍图'], ['address_photo', '常用住址拍照'],
  ['emergency_contact_photo', '紧急联系人通讯录'], ['other', '其他资料']
].map(([key, label]) => ({ key, label }))

export function money(value) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₫`
}

export function number(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0)
}

export function dateText(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 16)
}

export function statusMeta(status) {
  return ORDER_STATUS[status] || [status || '未知', 'gray']
}

export function billMeta(status) {
  return BILL_STATUS[status] || [status || '未知', 'gray']
}

export function payoutAmount(order) {
  const plan = order?.plan || {}
  return Math.max(0, Number(plan.price || 0) - Number(plan.downPayment || 0))
}

export function normalizeOrder(raw = {}) {
  const order = raw.order || raw
  const payments = order.payments || []
  const payee = order.payee || {}
  const store = order.store || {}
  const storePayee = store.payee || {}
  const bills = (order.bills || []).map(bill => {
    const succeeded = payments.filter(payment => payment.billId === bill.id && payment.status === 'succeeded')
    const realPaidAmount = bill.realPaidAmount ?? succeeded.filter(payment => !payment.isMock).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const mockPaidAmount = bill.mockPaidAmount ?? succeeded.filter(payment => payment.isMock).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return { ...bill, realPaidAmount, mockPaidAmount }
  })
  const esignAttempts = (order.esignAttempts || order.esignLog || []).map(attempt => ({
    ...attempt,
    contractNo: attempt.externalContractNo || attempt.contractNo,
    action: attempt.action || { pending: '等待演示结果', succeeded: '模拟成功', failed: '模拟失败' }[attempt.status] || attempt.status,
    by: attempt.actorName || attempt.by,
    at: attempt.completedAt || attempt.createdAt || attempt.at
  }))
  return {
    ...order,
    no: order.no || order.orderNo || order.id,
    status: order.status || 'draft',
    customer: order.customer || {},
    store: { ...store, payee: { ...storePayee, name: storePayee.name || storePayee.holder || '' } },
    device: order.device || {},
    docs: order.docs || {},
    payee: { ...payee, name: payee.name || payee.holder || '' },
    plan: order.plan || {},
    esign: { status: 'not_started', startedAt: esignAttempts[0]?.createdAt, ...(order.esign || {}) },
    esignAttempts,
    mdm: { bound: false, serial: '', imei: '', ...(order.mdm || {}) },
    finance: { status: '未提交', ...(order.financeReview || order.finance || {}) },
    payout: { status: '待放款', ...(order.payout || {}) },
    review: { first: order.firstReview || null, final: order.finalReview || null, ...(order.review || {}) },
    bills,
    logs: (order.logs || []).map(log => ({ ...log, by: log.actorName || log.by, role: log.actorRole || log.role, at: log.createdAt || log.at })),
    customerHistory: order.customerHistory || []
  }
}

export function unwrapList(data) {
  return { items: data?.items || data?.data?.items || [], total: Number(data?.total ?? data?.data?.total ?? data?.items?.length ?? 0) }
}

export function localDateTime() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function todayPlus(months = 1) {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
