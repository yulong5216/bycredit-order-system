const { ORDER_STATUS } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { toOrderDto } = require('../utils/dto');
const { transaction, findOrder, assertOrderAccess, detailInclude } = require('./orderService');

async function start(prisma, actor, id, provider) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, esignAttempts: { orderBy: { attempt: 'desc' }, take: 1 } });
    assertOrderAccess(order, actor);
    assert([ORDER_STATUS.PENDING_FIRST, ORDER_STATUS.REJECTED_FIRST].includes(order.status), 409, 'INVALID_STATE', '当前状态不可发起签约');
    assert(!order.esignAttempts[0] || order.esignAttempts[0].status !== 'succeeded', 409, 'ESIGN_COMPLETED', '已完成签约，无需重复发起');
    const attempt = (order.esignAttempts[0] ? order.esignAttempts[0].attempt : 0) + 1;
    const result = provider.start({ order, attempt });
    await tx.esignAttempt.create({
      data: {
        orderId: order.id,
        attempt,
        provider: result.provider,
        status: 'pending',
        providerStatus: result.providerStatus,
        rawCallback: result.rawCallback,
        isMock: result.isMock,
        actorName: actor.name
      }
    });
    await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.PENDING_SIGN, rejectReason: '' } });
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action: attempt > 1 ? '重新发起演示签约' : '发起演示签约',
      before: order.status,
      after: ORDER_STATUS.PENDING_SIGN,
      note: result.isMock ? '第 ' + attempt + ' 次；未创建真实合同或发送短信' : `第 ${attempt} 次`
    });
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

async function applyResult(prisma, actor, id, result) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, mdm: true });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_SIGN, 409, 'INVALID_STATE', '订单不在待签约状态');
    const attempt = await tx.esignAttempt.findFirst({ where: { orderId: order.id }, orderBy: { attempt: 'desc' } });
    assert(attempt, 404, 'ESIGN_NOT_FOUND', '签约记录不存在');
    if (attempt.status !== 'pending') {
      assert(attempt.status === (result.ok ? 'succeeded' : 'failed'), 409, 'INVALID_STATE', '本次签约结果已处理');
      const current = await findOrder(tx, order.id, detailInclude);
      return toOrderDto(current);
    }
    const nextStatus = result.ok ? 'succeeded' : 'failed';
    await tx.esignAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextStatus,
        externalContractNo: result.externalContractNo || null,
        providerStatus: result.providerStatus || nextStatus,
        failureReason: result.failureReason || '',
        pdfUrl: result.pdfUrl || null,
        rawCallback: result.rawCallback || undefined,
        isMock: result.isMock === true,
        completedAt: new Date()
      }
    });
    let orderStatus = ORDER_STATUS.PENDING_FIRST;
    const data = { status: orderStatus, rejectReason: result.ok ? '' : result.failureReason };
    if (result.ok && order.mdm && order.mdm.bound) {
      orderStatus = ORDER_STATUS.PENDING_FINAL;
      data.status = orderStatus;
      data.firstReview = {
        by: actor.name,
        at: new Date().toISOString(),
        result: 'pass',
        note: '签约成功且 MDM 已绑定，自动流转终审',
        automatic: true
      };
    }
    await tx.order.update({ where: { id: order.id }, data });
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action: result.ok ? (result.isMock ? '演示签约成功' : '签约成功') : (result.isMock ? '演示签约失败' : '签约失败'),
      before: ORDER_STATUS.PENDING_SIGN,
      after: orderStatus,
      note: result.ok ? `第 ${attempt.attempt} 次；合同号 ${result.externalContractNo}` : `第 ${attempt.attempt} 次；${result.failureReason}`
    });
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

module.exports = { start, applyResult };
