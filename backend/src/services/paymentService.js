const integration = require('../config/integration');
const config = require('../config');
const mockPaymentProvider = require('../providers/mockPaymentProvider');
const { ORDER_STATUS, BILL_STATUS, ACTIVE_ORDER_STATUSES } = require('../domain/constants');
const { DomainError, assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { requestNumber } = require('../utils/identifiers');
const { text, money } = require('../utils/validation');
const { toOrderDto } = require('../utils/dto');
const { repaymentStatus, isPaid } = require('../utils/repayment');
const { transaction, findOrder, assertOrderAccess, detailInclude } = require('./orderService');

function paymentDto(payment) {
  return {
    requestNo: payment.requestNo,
    shortCode: payment.requestNo,
    orderId: payment.orderId,
    billId: payment.billId,
    amount: payment.amount,
    status: payment.status,
    provider: payment.provider,
    channel: payment.channel,
    demo: payment.isMock,
    qrLink: null,
    qrCode: null,
    expiresAt: payment.expiresAt,
    paid: payment.status === 'succeeded',
    paidAt: payment.paidAt,
    txnNo: payment.externalTxnNo,
    failureReason: payment.failureReason
  };
}

async function generate(prisma, actor, payload) {
  assert(integration.paymentProvider === 'mock', 503, 'PAYMENT_DISABLED', '线上支付当前未启用，请使用人工还款登记');
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, payload.orderId, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    assert(ACTIVE_ORDER_STATUSES.includes(order.status) && order.status !== ORDER_STATUS.CLOSED, 409, 'INVALID_STATE', '订单当前不可还款');
    const bill = order.bills.find(item => item.period === Number(payload.period));
    assert(bill, 404, 'BILL_NOT_FOUND', '账单不存在');
    assert(!isPaid(bill), 409, 'BILL_PAID', '该期账单已完成还款');
    const existing = await tx.paymentRequest.findFirst({
      where: { billId: bill.id, status: 'pending', provider: 'mock', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) return paymentDto(existing);

    const requestNo = requestNumber();
    const expiresAt = new Date(Date.now() + config.mockPaymentTtlMinutes * 60 * 1000);
    const providerResult = mockPaymentProvider.createRequest({ requestNo, amount: bill.amount, expiresAt });
    const payment = await tx.paymentRequest.create({
      data: {
        requestNo,
        orderId: order.id,
        billId: bill.id,
        amount: bill.amount,
        channel: providerResult.channel,
        provider: providerResult.provider,
        isMock: true,
        expiresAt,
        rawResponse: providerResult.rawResponse,
        actorName: actor.name || actor.phone
      }
    });
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action: '创建演示支付请求',
      before: `第 ${bill.period} 期 ${bill.status}`,
      after: requestNo,
      note: '不生成真实二维码，不发生真实扣款'
    });
    return paymentDto(payment);
  });
}

async function settleInTransaction(tx, params) {
  const payment = await tx.paymentRequest.findUnique({
    where: { requestNo: params.requestNo },
    include: { bill: true, order: { include: { customer: true } } }
  });
  assert(payment, 404, 'PAYMENT_NOT_FOUND', '支付请求不存在');
  if (payment.status === 'succeeded') {
    assert(payment.externalTxnNo === params.externalTxnNo, 409, 'PAYMENT_CONFLICT', '支付请求已使用其他交易号销账');
    return { duplicate: true, payment, bill: payment.bill, orderStatus: payment.order.status };
  }
  assert(payment.status === 'pending', 409, 'INVALID_STATE', '支付请求当前不可销账');

  const duplicate = await tx.paymentRequest.findFirst({
    where: {
      id: { not: payment.id },
      channel: params.channel,
      externalTxnNo: params.externalTxnNo,
      status: 'succeeded'
    }
  });
  if (duplicate || isPaid(payment.bill)) {
    const duplicatePayment = await tx.paymentRequest.update({
      where: { id: payment.id },
      data: {
        status: 'duplicate',
        failureReason: duplicate ? `重复交易，已由 ${duplicate.requestNo} 销账` : '账单已由其他支付请求销账',
        rawResponse: params.rawResponse || undefined
      }
    });
    await audit(tx, {
      orderId: payment.orderId,
      storeId: payment.order.storeId,
      actor: params.actor,
      action: '拦截重复支付',
      before: payment.requestNo,
      after: duplicatePayment.failureReason,
      note: params.externalTxnNo
    });
    return { duplicate: true, payment: duplicatePayment, bill: payment.bill, orderStatus: payment.order.status };
  }

  const amount = BigInt(params.amount);
  if (amount !== payment.amount || amount !== payment.bill.amount) {
    const reason = `金额异常：请求 ${payment.amount}，账单 ${payment.bill.amount}，到账 ${amount}`;
    const exception = await tx.paymentRequest.update({
      where: { id: payment.id },
      data: { status: 'exception', failureReason: reason, rawResponse: params.rawResponse || undefined }
    });
    await audit(tx, {
      orderId: payment.orderId,
      storeId: payment.order.storeId,
      actor: params.actor,
      action: '支付金额异常',
      before: payment.amount,
      after: amount,
      note: `${reason}；未销账`
    });
    return { error: new DomainError(409, 'AMOUNT_MISMATCH', reason), payment: exception };
  }

  const paidAt = params.paidAt || new Date();
  const updatedPayment = await tx.paymentRequest.update({
    where: { id: payment.id },
    data: {
      status: 'succeeded',
      externalTxnNo: params.externalTxnNo,
      paidAt,
      rawResponse: params.rawResponse || undefined,
      failureReason: ''
    }
  });
  const updatedBill = await tx.bill.update({
    where: { id: payment.billId },
    data: {
      status: BILL_STATUS.PAID,
      paidAmount: payment.bill.amount,
      paidAt,
      channel: params.channel,
      txnNo: params.externalTxnNo,
      note: params.note || payment.bill.note
    }
  });
  const bills = await tx.bill.findMany({ where: { orderId: payment.orderId } });
  const orderStatus = repaymentStatus(bills);
  await tx.order.update({
    where: { id: payment.orderId },
    data: { status: orderStatus, closedAt: orderStatus === ORDER_STATUS.CLOSED ? paidAt : null }
  });
  await audit(tx, {
    orderId: payment.orderId,
    storeId: payment.order.storeId,
    actor: params.actor,
    action: params.isMock ? '演示支付到账并销账' : (['cash', 'bank_transfer'].includes(params.channel) ? '代客登记还款并销账' : '线上支付到账并销账'),
    before: { billStatus: payment.bill.status, paidAmount: payment.bill.paidAmount, orderStatus: payment.order.status },
    after: { billStatus: updatedBill.status, paidAmount: updatedBill.paidAmount, orderStatus, txnNo: params.externalTxnNo, channel: params.channel, isMock: params.isMock },
    note: params.note || (params.isMock ? '演示交易，不计入真实财务统计' : '')
  });
  return { duplicate: false, payment: updatedPayment, bill: updatedBill, orderStatus };
}

async function settlePayment(prisma, params) {
  const result = await transaction(prisma, tx => settleInTransaction(tx, params));
  if (result.error) throw result.error;
  return result;
}

async function applyMockResult(prisma, actor, requestNo, payload) {
  assert(integration.paymentProvider === 'mock', 404, 'NOT_FOUND', '接口不存在');
  const existing = await prisma.paymentRequest.findUnique({ where: { requestNo }, include: { order: { include: { customer: true } } } });
  assert(existing, 404, 'PAYMENT_NOT_FOUND', '支付请求不存在');
  assertOrderAccess(existing.order, actor);
  assert(existing.provider === 'mock' && existing.isMock, 409, 'INVALID_STATE', '仅演示支付可使用该入口');

  if (payload.ok !== true) {
    const reason = text(payload.reason, '失败原因');
    const result = await transaction(prisma, async tx => {
      const payment = await tx.paymentRequest.findUnique({ where: { requestNo }, include: { order: true } });
      if (payment.status === 'failed') return payment;
      assert(payment.status === 'pending', 409, 'INVALID_STATE', '支付请求已处理');
      const updated = await tx.paymentRequest.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: reason, rawResponse: { demo: true, ...payload } } });
      await audit(tx, { orderId: payment.orderId, storeId: payment.order.storeId, actor, action: '演示支付失败', before: payment.status, after: 'failed', note: reason });
      return updated;
    });
    return paymentDto(result);
  }

  const externalTxnNo = text(payload.txnNo || mockPaymentProvider.successfulTransaction(requestNo), '演示交易号');
  assert(externalTxnNo.toUpperCase().startsWith('MOCK-'), 400, 'VALIDATION_ERROR', '演示交易号必须以 MOCK- 开头');
  const amount = payload.amount === undefined ? existing.amount : money(payload.amount, '到账金额');
  await settlePayment(prisma, {
    requestNo,
    externalTxnNo,
    amount,
    channel: 'mock_qr',
    isMock: true,
    paidAt: new Date(),
    rawResponse: { demo: true, ...payload },
    actor
  });
  const payment = await prisma.paymentRequest.findUnique({ where: { requestNo } });
  return paymentDto(payment);
}

async function manualPay(prisma, actor, orderId, period, payload) {
  const channel = text(payload.channel, '支付渠道');
  assert(['bank_transfer', 'cash'].includes(channel), 400, 'VALIDATION_ERROR', '人工还款仅支持普通转账或现金');
  const txnNo = text(payload.txnNo, '支付订单号');
  const paidAt = new Date(payload.paidAt);
  assert(!Number.isNaN(paidAt.getTime()), 400, 'VALIDATION_ERROR', '支付时间不正确');
  const note = text(payload.note, '备注', false);

  const result = await transaction(prisma, async tx => {
    const order = await findOrder(tx, orderId, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    const bill = order.bills.find(item => item.period === Number(period));
    assert(bill, 404, 'BILL_NOT_FOUND', '账单不存在');
    assert(!isPaid(bill), 409, 'BILL_PAID', '该期账单已完成还款，不可重复登记');
    const payment = await tx.paymentRequest.create({
      data: {
        requestNo: requestNumber(),
        orderId: order.id,
        billId: bill.id,
        amount: bill.amount,
        channel,
        provider: 'manual',
        isMock: false,
        actorName: actor.name,
        rawResponse: { manual: true, registeredBy: actor.name }
      }
    });
    const settled = await settleInTransaction(tx, {
      requestNo: payment.requestNo,
      externalTxnNo: txnNo,
      amount: bill.amount,
      channel,
      isMock: false,
      paidAt,
      rawResponse: { manual: true, channel, paidAt: paidAt.toISOString(), note },
      actor,
      note
    });
    if (settled.error) return settled;
    const updated = await findOrder(tx, order.id, detailInclude);
    return { ...settled, order: toOrderDto(updated) };
  });
  if (result.error) throw result.error;
  return result;
}

async function status(prisma, actor, requestNo) {
  let payment = await prisma.paymentRequest.findUnique({ where: { requestNo }, include: { order: { include: { customer: true } } } });
  assert(payment, 404, 'PAYMENT_NOT_FOUND', '支付请求不存在');
  assertOrderAccess(payment.order, actor);
  if (payment.status === 'pending' && payment.expiresAt && payment.expiresAt <= new Date()) {
    payment = await prisma.paymentRequest.update({ where: { id: payment.id }, data: { status: 'expired', failureReason: '演示支付请求已过期' }, include: { order: { include: { customer: true } } } });
  }
  return paymentDto(payment);
}

module.exports = { generate, settlePayment, applyMockResult, manualPay, status, paymentDto };
