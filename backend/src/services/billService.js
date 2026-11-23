const { ORDER_STATUS, BILL_STATUS } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { text } = require('../utils/validation');
const { asDateOnly } = require('../utils/schedule');
const { repaymentStatus, isPaid } = require('../utils/repayment');
const { toOrderDto } = require('../utils/dto');
const { transaction, findOrder, assertOrderAccess, detailInclude, getOrder } = require('./orderService');

async function listBills(prisma, actor, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(query.size) || 50));
  const where = { order: {} };
  if (actor.type === 'customer') where.order.customer = { phone: actor.phone };
  else if (actor.role === 'sales') where.order.salesId = actor.sub;
  else if (actor.role === 'manager') where.order.storeId = actor.storeId;
  else if (actor.role === 'collector') where.order.status = { in: [ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH] };
  if (query.status && query.status !== 'all') where.status = query.status;
  if (query.store) where.order.storeId = query.store;
  if (actor.role === 'manager') where.order.storeId = actor.storeId;
  if (query.month) {
    const start = asDateOnly(`${query.month}-01`);
    where.dueDate = { gte: start, lt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
  }
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { order: { orderNo: { contains: q } } },
      { order: { customer: { name: { contains: q } } } },
      { order: { customer: { phone: { contains: q } } } }
    ];
  }
  const [rows, total, summaryRows] = await prisma.$transaction([
    prisma.bill.findMany({
      where,
      include: { order: { include: { customer: true, store: true } }, payments: { where: { status: 'succeeded' } } },
      orderBy: [{ dueDate: 'asc' }, { period: 'asc' }],
      skip: (page - 1) * size,
      take: size
    }),
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      select: { amount: true, status: true, payments: { where: { status: 'succeeded' }, select: { amount: true, isMock: true } } }
    })
  ]);
  const items = rows.map(row => ({
    ...row,
    orderNo: row.order.orderNo,
    customer: row.order.customer.name,
    phone: row.order.customer.phone,
    storeId: row.order.storeId,
    storeName: row.order.store.name,
    salesName: row.order.salesName,
    model: row.order.device?.model || '',
    periods: row.order.periods,
    orderStatus: row.order.status,
    realPaidAmount: row.payments.filter(payment => !payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n),
    mockPaidAmount: row.payments.filter(payment => payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n)
  }));
  const summaryValues = summaryRows.map(row => ({
    amount: row.amount,
    status: row.status,
    realPaidAmount: row.payments.filter(payment => !payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n),
    mockPaidAmount: row.payments.filter(payment => payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n)
  }));
  const summary = {
    count: total,
    due: summaryValues.reduce((sum, item) => {
      const outstanding = item.amount - item.realPaidAmount;
      return sum + (outstanding > 0n ? outstanding : 0n);
    }, 0n),
    paid: summaryValues.reduce((sum, item) => sum + item.realPaidAmount, 0n),
    mockPaid: summaryValues.reduce((sum, item) => sum + item.mockPaidAmount, 0n),
    overdue: summaryValues.filter(item => [BILL_STATUS.OVERDUE, BILL_STATUS.BREACH].includes(item.status)).reduce((sum, item) => {
      const outstanding = item.amount - item.realPaidAmount;
      return sum + (outstanding > 0n ? outstanding : 0n);
    }, 0n),
    overdueCount: summaryValues.filter(item => [BILL_STATUS.OVERDUE, BILL_STATUS.BREACH].includes(item.status)).length
  };
  return { items, total, page, size, summary };
}

async function orderBills(prisma, actor, orderId) {
  const order = await getOrder(prisma, actor, orderId);
  return { items: order.bills, payments: order.payments, total: order.bills.length };
}

async function defer(prisma, actor, orderId, period, payload) {
  const days = Number(payload.days);
  assert(Number.isInteger(days) && days >= 1 && days <= 30, 400, 'VALIDATION_ERROR', '延期天数须为 1-30 天');
  const note = text(payload.note, '延期原因');
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, orderId, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    const bill = order.bills.find(item => item.period === Number(period));
    assert(bill, 404, 'BILL_NOT_FOUND', '账单不存在');
    assert(!isPaid(bill), 409, 'BILL_PAID', '已还账单不可延期');
    const dueDate = new Date(bill.dueDate.getTime() + days * 86400000);
    const updatedBill = await tx.bill.update({ where: { id: bill.id }, data: { dueDate, status: BILL_STATUS.DEFERRED, note: `延期 ${days} 天：${note}` } });
    const bills = await tx.bill.findMany({ where: { orderId: order.id } });
    const status = repaymentStatus(bills);
    await tx.order.update({ where: { id: order.id }, data: { status } });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '办理延期', before: { dueDate: bill.dueDate, status: bill.status, orderStatus: order.status }, after: { dueDate: updatedBill.dueDate, status: updatedBill.status, orderStatus: status }, note });
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

async function breach(prisma, actor, orderId, period, payload) {
  const note = text(payload.note, '坏账原因');
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, orderId, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    const bill = order.bills.find(item => item.period === Number(period));
    assert(bill, 404, 'BILL_NOT_FOUND', '账单不存在');
    assert(!isPaid(bill), 409, 'BILL_PAID', '已还账单不可标记坏账');
    await tx.bill.update({ where: { id: bill.id }, data: { status: BILL_STATUS.BREACH, note } });
    await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.BREACH } });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '标记坏账', before: { billStatus: bill.status, orderStatus: order.status }, after: { billStatus: BILL_STATUS.BREACH, orderStatus: ORDER_STATUS.BREACH }, note });
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

async function markOverdue(prisma, now = new Date()) {
  const candidates = await prisma.bill.findMany({
    where: { status: { in: [BILL_STATUS.PENDING, BILL_STATUS.DEFERRED] }, dueDate: { lt: asDateOnly(now) }, order: { status: { in: [ORDER_STATUS.REPAYING, ORDER_STATUS.OVERDUE] } } },
    include: { order: { include: { customer: true } } }
  });
  let count = 0;
  for (const bill of candidates) {
    await transaction(prisma, async tx => {
      const current = await tx.bill.findUnique({ where: { id: bill.id }, include: { order: true } });
      if (!current || ![BILL_STATUS.PENDING, BILL_STATUS.DEFERRED].includes(current.status)) return;
      await tx.bill.update({ where: { id: current.id }, data: { status: BILL_STATUS.OVERDUE } });
      if (current.order.status === ORDER_STATUS.REPAYING) {
        await tx.order.update({ where: { id: current.orderId }, data: { status: ORDER_STATUS.OVERDUE } });
      }
      await audit(tx, { orderId: current.orderId, storeId: current.order.storeId, actor: null, action: '账单逾期', before: current.status, after: BILL_STATUS.OVERDUE, note: `第 ${current.period} 期到期未还` });
      count++;
    });
  }
  return count;
}

module.exports = { listBills, orderBills, defer, breach, markOverdue };
