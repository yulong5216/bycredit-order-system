const { Prisma } = require('@prisma/client');
const { ORDER_STATUS, ACTIVE_ORDER_STATUSES, PRE_FIRST_REVIEW_STATUSES } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { orderNumber } = require('../utils/identifiers');
const { normalizePlan, normalizeCustomer, normalizeDevice, text } = require('../utils/validation');
const { asDateOnly, addMonths } = require('../utils/schedule');
const { toOrderDto } = require('../utils/dto');

const detailInclude = {
  customer: true,
  store: true,
  mdm: true,
  bills: { orderBy: { period: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  esignAttempts: { orderBy: { attempt: 'desc' } },
  logs: { orderBy: { createdAt: 'desc' } }
};

function transaction(prisma, work) {
  return prisma.$transaction(work, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000
  });
}

async function findOrder(db, id, include) {
  return db.order.findFirst({ where: { OR: [{ id }, { orderNo: id }] }, include });
}

function assertOrderAccess(order, actor) {
  assert(order, 404, 'ORDER_NOT_FOUND', '订单不存在');
  if (actor.role === 'admin') return;
  if (actor.type === 'customer') {
    assert(order.customer.phone === actor.phone, 403, 'FORBIDDEN', '只能查看当前手机号名下的订单');
    return;
  }
  if (actor.role === 'sales') {
    assert(order.salesId === actor.sub, 403, 'FORBIDDEN', '只能操作自己录入的订单');
  } else if (actor.role === 'manager') {
    assert(order.storeId === actor.storeId, 403, 'FORBIDDEN', '只能操作本店订单');
  } else if (actor.role === 'collector') {
    assert([ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH].includes(order.status), 403, 'FORBIDDEN', '催收角色只能查看逾期或坏账订单');
  }
}

function validateSubmission(payload, plan, payee) {
  assert(payee && text(payee.account, '门店收款账号'), 400, 'PAYEE_REQUIRED', '请补充门店收款信息');
  assert(plan.periods > 0, 400, 'VALIDATION_ERROR', '分期方案不完整');
}

async function createOrder(prisma, actor, payload) {
  const docs = payload.docs;
  assert(docs === undefined || (docs && typeof docs === 'object' && !Array.isArray(docs) && Object.keys(docs).length === 0), 400, 'DOCUMENT_UPLOAD_REQUIRED', '影像资料必须在保存草稿后通过专用上传接口提交');
  const customer = normalizeCustomer(payload.customer);
  const device = normalizeDevice(payload.device);
  const planInput = { ...payload.plan, firstDueDate: payload.plan.firstDueDate || addMonths(new Date(), 1) };
  const plan = normalizePlan(planInput);
  const submit = payload.submit === true;
  const payee = payload.payee || {};
  if (submit) validateSubmission(payload, plan, payee);

  return transaction(prisma, async tx => {
    const storeId = text(payload.plan.storeId || actor.storeId, '门店');
    const store = await tx.store.findUnique({ where: { id: storeId } });
    assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
    assert(store.status === 'active', 409, 'STORE_FROZEN', '所选门店已冻结，不可录入新单');
    if (actor.role !== 'admin') assert(!actor.storeId || actor.storeId === store.id, 403, 'FORBIDDEN', '不可为其他门店录单');

    let salesId = actor.role === 'sales' ? actor.sub : (payload.plan.salesId || actor.sub);
    let salesName = actor.name;
    if (salesId !== actor.sub) {
      const sales = await tx.user.findFirst({ where: { id: salesId, role: 'sales', active: true } });
      assert(sales, 400, 'VALIDATION_ERROR', '业务员不存在或已停用');
      salesName = sales.name;
    }

    const createdCustomer = await tx.customer.create({ data: customer });
    const order = await tx.order.create({
      data: {
        orderNo: orderNumber(),
        status: submit ? ORDER_STATUS.PENDING_FIRST : ORDER_STATUS.DRAFT,
        customerId: createdCustomer.id,
        storeId: store.id,
        salesId,
        salesName,
        urgent: payload.urgent === true,
        docs: {},
        device,
        checks: device.checks,
        payee,
        ...plan,
        submittedAt: submit ? new Date() : null
      },
      include: detailInclude
    });
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action: submit ? '提交订单' : '保存草稿',
      before: null,
      after: order.status,
      note: `门店：${store.name}`
    });
    return toOrderDto(order);
  });
}

async function listOrders(prisma, actor, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(query.size) || 20));
  const where = {};
  if (actor.type === 'customer') where.customer = { phone: actor.phone };
  else if (actor.role === 'sales') where.salesId = actor.sub;
  else if (actor.role === 'manager') where.storeId = actor.storeId;
  else if (actor.role === 'collector') where.status = { in: [ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH] };

  if (query.status && query.status !== 'all') {
    const groups = {
      first: [ORDER_STATUS.PENDING_FIRST],
      sign: [ORDER_STATUS.PENDING_SIGN],
      final: [ORDER_STATUS.PENDING_FINAL],
      finance: [ORDER_STATUS.APPROVED_FINAL, ORDER_STATUS.PENDING_FINANCE],
      payout: [ORDER_STATUS.PENDING_PAYOUT],
      repaying: [ORDER_STATUS.REPAYING, ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH],
      rejected: [ORDER_STATUS.REJECTED_FIRST, ORDER_STATUS.REJECTED_FINAL]
    };
    where.status = { in: groups[query.status] || [query.status] };
  }
  if (query.store) where.storeId = query.store;
  if (actor.role === 'manager') where.storeId = actor.storeId;
  if (actor.role === 'collector') where.status = { in: [ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH] };
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { orderNo: { contains: q } },
      { salesName: { contains: q } },
      { customer: { name: { contains: q } } },
      { customer: { phone: { contains: q } } },
      { customer: { idNo: { contains: q } } }
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: { customer: true, store: true, mdm: true, bills: true, payments: { where: { status: 'succeeded' } }, esignAttempts: { orderBy: { attempt: 'desc' }, take: 1 } },
      orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * size,
      take: size
    }),
    prisma.order.count({ where })
  ]);
  return { items: items.map(item => toOrderDto(item)), total, page, size };
}

async function getOrder(prisma, actor, id) {
  const order = await findOrder(prisma, id, detailInclude);
  assertOrderAccess(order, actor);
  const history = await prisma.order.findMany({
    where: { customer: { idNo: order.customer.idNo }, id: { not: order.id } },
    select: { id: true, orderNo: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  const customerHistory = history.map(item => ({
    ...item,
    no: item.orderNo,
    risk: [ORDER_STATUS.OVERDUE, ORDER_STATUS.BREACH].includes(item.status) ? 'bad' : 'normal'
  }));
  return toOrderDto(order, customerHistory);
}

async function updateOrder(prisma, actor, id, payload) {
  assert(!Object.prototype.hasOwnProperty.call(payload, 'docs'), 400, 'DOCUMENT_UPLOAD_REQUIRED', '影像资料请使用专用上传接口，不支持仅修改文件元数据');
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    // 用户明确要求：初审通过后不可再编辑客户资料
    // 允许编辑客户资料的状态: draft / pending_first / rejected_first / pending_customer_sign
    const editableStates = ['draft', ...PRE_FIRST_REVIEW_STATUSES];
    assert(editableStates.includes(order.status), 409, 'INVALID_STATE', '初审后不可再编辑客户资料，如需修改请走备注或联系终审/管理员');
    assert(!ACTIVE_ORDER_STATUSES.includes(order.status) && order.status !== ORDER_STATUS.CANCELLED, 409, 'INVALID_STATE', '放款或取消后不可修改订单资料');
    const before = {};
    const after = {};
    const data = {};
    if (payload.customer) {
      before.customer = order.customer;
      after.customer = normalizeCustomer({ ...order.customer, ...payload.customer });
      data.customer = { update: after.customer };
    }
    if (payload.device) {
      before.device = order.device;
      after.device = normalizeDevice({ ...order.device, ...payload.device });
      data.device = after.device;
      data.checks = after.device.checks;
    }
    if (payload.payee) {
      before.payee = order.payee;
      after.payee = { ...order.payee, ...payload.payee };
      data.payee = after.payee;
    }
    const updated = await tx.order.update({ where: { id: order.id }, data, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '修改订单资料', before, after, note: payload.note });
    return toOrderDto(updated);
  });
}

async function submitOrder(prisma, actor, id) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, store: true });
    assertOrderAccess(order, actor);
    assert([ORDER_STATUS.DRAFT, ORDER_STATUS.REJECTED_FIRST, ORDER_STATUS.REJECTED_FINAL].includes(order.status), 409, 'INVALID_STATE', '当前状态不可提交初审');
    assert(order.store.status === 'active', 409, 'STORE_FROZEN', '门店已冻结，不可提交新单');
    validateSubmission(order, order, order.payee);
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.PENDING_FIRST, submittedAt: new Date(), rejectReason: '' },
      include: detailInclude
    });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: order.status === ORDER_STATUS.DRAFT ? '提交订单' : '重新提交订单', before: order.status, after: updated.status });
    return toOrderDto(updated);
  });
}

async function reviewFirst(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, mdm: true, esignAttempts: { orderBy: { attempt: 'desc' }, take: 1 } });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_FIRST, 409, 'INVALID_STATE', '订单不在待初审状态');
    const result = payload.result;
    assert(['pass', 'reject'].includes(result), 400, 'VALIDATION_ERROR', '审核结果不正确');
    const note = text(payload.note, '审核备注', false);
    if (result === 'reject') assert(note, 400, 'VALIDATION_ERROR', '初审驳回必须填写原因');
    if (result === 'pass') {
      assert(order.esignAttempts[0] && order.esignAttempts[0].status === 'succeeded', 409, 'ESIGN_REQUIRED', '电子签约未完成，不能初审通过');
      assert(order.mdm && order.mdm.bound, 409, 'MDM_REQUIRED', '请先登记 MDM 绑定结果');
      assert(order.payee && order.payee.account, 409, 'PAYEE_REQUIRED', '请先补充门店收款信息');
    }
    const status = result === 'pass' ? ORDER_STATUS.PENDING_FINAL : ORDER_STATUS.REJECTED_FIRST;
    const firstReview = { by: actor.name, at: new Date().toISOString(), result, note: note || '', checks: payload.checks || [] };
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status, firstReview, rejectReason: result === 'reject' ? note : '' },
      include: detailInclude
    });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: result === 'pass' ? '初审通过' : '初审驳回', before: order.status, after: status, note });
    return toOrderDto(updated);
  });
}

// 用户明确要求：初审必须手动点击通过才能流转到终审，不允许任何自动流转
// 此函数保留但不再被调用，签名供未来需要时使用
async function maybeAdvanceToFinal(tx, orderId, actor, note) {
  return null;
}

async function reviewFinal(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, store: true, mdm: true, esignAttempts: { orderBy: { attempt: 'desc' }, take: 1 } });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.PENDING_FINAL, 409, 'INVALID_STATE', '订单不在待终审状态');
    const result = payload.result;
    assert(['pass', 'reject'].includes(result), 400, 'VALIDATION_ERROR', '审核结果不正确');
    const note = text(payload.note, '终审备注', false);
    if (result === 'reject') assert(note, 400, 'VALIDATION_ERROR', '终审驳回必须填写原因');
    if (result === 'pass') {
      assert(order.mdm && order.mdm.bound, 409, 'MDM_REQUIRED', 'MDM 未绑定，不能终审通过');
      assert(order.esignAttempts[0] && order.esignAttempts[0].status === 'succeeded', 409, 'ESIGN_REQUIRED', '签约未完成，不能终审通过');
    }
    const finalReview = { by: actor.name, at: new Date().toISOString(), result, note: note || '', checks: payload.checks || [] };
    let status = result === 'pass' ? ORDER_STATUS.APPROVED_FINAL : ORDER_STATUS.REJECTED_FINAL;
    await tx.order.update({ where: { id: order.id }, data: { status, finalReview, rejectReason: result === 'reject' ? note : '' } });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: result === 'pass' ? '终审通过' : '终审驳回', before: order.status, after: status, note });
    if (result === 'pass' && order.store.status === 'active') {
      const before = status;
      status = ORDER_STATUS.PENDING_FINANCE;
      await tx.order.update({ where: { id: order.id }, data: { status, financeReview: { status: 'pending' } } });
      await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '自动送财务审核', before, after: status });
    }
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

async function sendToFinance(prisma, actor, id) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, store: true });
    assertOrderAccess(order, actor);
    assert(order.status === ORDER_STATUS.APPROVED_FINAL, 409, 'INVALID_STATE', '当前状态不可送财务');
    assert(order.store.status === 'active', 409, 'STORE_FROZEN', '门店已冻结，不可送财务');
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.PENDING_FINANCE, financeReview: { status: 'pending' } }, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '发送财务审核', before: order.status, after: updated.status });
    return toOrderDto(updated);
  });
}

async function updatePlan(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    const beforeFirstPass = PRE_FIRST_REVIEW_STATUSES.includes(order.status);
    assert(actor.role === 'admin' || (actor.role === 'first' && beforeFirstPass), 403, 'FORBIDDEN', '初审通过后仅管理员可修改账单方案');
    assert(!order.payoutAt && !ACTIVE_ORDER_STATUSES.includes(order.status), 409, 'INVALID_STATE', '放款后不可修改账单方案');
    const plan = normalizePlan({ ...payload, firstDueDate: payload.firstDueDate || order.firstDueDate });
    const before = { price: order.price, downPayment: order.downPayment, principal: order.principal, periods: order.periods, rateBps: order.rateBps, perPeriod: order.perPeriod };
    const updated = await tx.order.update({ where: { id: order.id }, data: plan, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '修改账单方案', before, after: plan, note: payload.note });
    return toOrderDto(updated);
  });
}

async function changeDueDate(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, bills: true });
    assertOrderAccess(order, actor);
    const beforeFirstPass = PRE_FIRST_REVIEW_STATUSES.includes(order.status);
    assert(actor.role === 'admin' || (actor.role === 'first' && beforeFirstPass), 403, 'FORBIDDEN', '初审通过后仅管理员可修改还款日');
    const note = text(payload.note, '修改原因');
    const firstDueDate = asDateOnly(payload.firstDueDate);
    const updated = await tx.order.update({ where: { id: order.id }, data: { firstDueDate }, include: detailInclude });
    await Promise.all(order.bills.filter(bill => !bill.paidAt).map(bill => tx.bill.update({ where: { id: bill.id }, data: { dueDate: addMonths(firstDueDate, bill.period - 1) } })));
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '修改还款日', before: order.firstDueDate, after: firstDueDate, note });
    return toOrderDto(updated);
  });
}

async function cancelOrder(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    assert(!ACTIVE_ORDER_STATUSES.includes(order.status) && order.status !== ORDER_STATUS.CANCELLED, 409, 'INVALID_STATE', '当前状态不可取消');
    const note = text(payload.note, '取消原因');
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date() }, include: detailInclude });
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '取消订单', before: order.status, after: updated.status, note });
    return toOrderDto(updated);
  });
}

async function addNote(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true });
    assertOrderAccess(order, actor);
    const note = text(payload.note, '备注内容');
    await audit(tx, { orderId: order.id, storeId: order.storeId, actor, action: '添加备注', before: null, after: null, note });
    return getOrder(tx, actor, order.id);
  });
}

module.exports = {
  detailInclude,
  transaction,
  findOrder,
  assertOrderAccess,
  createOrder,
  listOrders,
  getOrder,
  updateOrder,
  submitOrder,
  reviewFirst,
  maybeAdvanceToFinal,
  reviewFinal,
  sendToFinance,
  updatePlan,
  changeDueDate,
  cancelOrder,
  addNote
};
