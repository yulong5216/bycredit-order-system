const { ORDER_STATUS } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { text } = require('../utils/validation');
const { buildBillRows } = require('../utils/schedule');
const { toOrderDto } = require('../utils/dto');
const { transaction, findOrder, assertOrderAccess, detailInclude } = require('./orderService');

async function approve(prisma, actor, id, payload = {}) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_FINANCE, 409, 'INVALID_STATE', '订单不在财务待审批状态');
    const financeReview = { status: 'approved', by: actor.name, at: new Date().toISOString(), note: text(payload.note, '财务备注', false) };
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.PENDING_PAYOUT, financeReview }, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '财务审批通过', before: order.status, after: updated.status, note: payload.note });
    return toOrderDto(updated);
  });
}

async function reject(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_FINANCE, 409, 'INVALID_STATE', '订单不在财务待审批状态');
    const note = text(payload.note, '退回原因');
    const financeReview = { status: 'returned', by: actor.name, at: new Date().toISOString(), note };
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.APPROVED_FINAL, financeReview }, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '财务退回', before: order.status, after: updated.status, note });
    return toOrderDto(updated);
  });
}

async function payout(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_PAYOUT, 409, 'INVALID_STATE', '订单不在待放款状态');
    const ref = text(payload.ref, '银行回单号');
    assert(order.bills.length === 0, 409, 'BILLS_EXIST', '账单已生成，不可重复放款');
    const paidAt = new Date();
    await tx.bill.createMany({
      data: buildBillRows({
        total: order.perPeriod * BigInt(order.periods),
        periods: order.periods,
        perPeriod: order.perPeriod,
        firstDueDate: order.firstDueDate
      }).map(row => ({ ...row, orderId: order.id }))
    });
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.REPAYING, payoutAt: paidAt, payoutRef: ref, payoutBy: actor.name },
      include: detailInclude
    });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '确认放款并生成账单', before: order.status, after: updated.status, note: `银行回单号 ${ref}；共 ${order.periods} 期` });
    return toOrderDto(updated);
  });
}

module.exports = { approve, reject, payout };
