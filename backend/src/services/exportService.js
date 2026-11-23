const { asDateOnly, dateOnly } = require('../utils/schedule');

const HEADERS = ['订单号', '客户姓名', '客户手机', '证件号', '门店', '业务员', '商品售价', '分期额', '已回款', '未回款', '期数', '首期还款日', '订单状态', '放款时间', '终审人', '终审时间', '终审批注'];
const STATUS = {
  draft: '草稿', pending_first: '待初审', rejected_first: '初审驳回', pending_customer_sign: '待签约',
  pending_final: '待终审', rejected_final: '终审驳回', approved_final: '终审通过待送财务',
  pending_finance: '待财务审批', pending_payout: '待放款', repaying: '还款中', overdue: '已逾期',
  breach: '坏账', closed: '已结清', cancelled: '已取消'
};

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function financeExport(prisma, query) {
  const where = { payoutAt: { not: null } };
  if (query.store) where.storeId = query.store;
  if (query.orderIds) {
    const orderIds = String(query.orderIds).split(',').map(id => id.trim()).filter(Boolean);
    where.id = { in: orderIds };
  }
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { orderNo: { contains: q } },
      { salesName: { contains: q } },
      { customer: { name: { contains: q } } },
      { customer: { phone: { contains: q } } },
      { customer: { idNo: { contains: q } } },
      { store: { name: { contains: q } } }
    ];
  }
  if (query.month) {
    const start = asDateOnly(`${query.month}-01`);
    where.payoutAt = { gte: start, lt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
  }
  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, store: true },
    orderBy: { payoutAt: 'asc' }
  });
  const payments = await prisma.paymentRequest.groupBy({
    by: ['orderId'],
    where: { orderId: { in: orders.map(order => order.id) }, status: 'succeeded', isMock: false },
    _sum: { amount: true }
  });
  const received = new Map(payments.map(item => [item.orderId, item._sum.amount || 0n]));
  const rows = orders.map(order => {
    const paid = received.get(order.id) || 0n;
    const total = order.perPeriod * BigInt(order.periods);
    const review = order.finalReview || {};
    return [
      order.orderNo, order.customer.name, order.customer.phone, order.customer.idNo,
      order.store.name, order.salesName, order.price, order.principal, paid,
      total > paid ? total - paid : 0n, order.periods,
      dateOnly(order.firstDueDate), STATUS[order.status] || order.status,
      order.payoutAt ? order.payoutAt.toISOString() : '', review.by || '',
      review.at || '', review.note || ''
    ];
  });
  return '\uFEFF' + [HEADERS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { financeExport, csvCell, HEADERS };
