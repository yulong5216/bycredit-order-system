const { Prisma } = require('@prisma/client');
const { ORDER_STATUS } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { text } = require('../utils/validation');
const { toOrderDto } = require('../utils/dto');
const { transaction, findOrder, assertOrderAccess, detailInclude, maybeAdvanceToFinal } = require('./orderService');

const EDITABLE_STATUSES = [
  ORDER_STATUS.PENDING_FIRST,
  ORDER_STATUS.REJECTED_FIRST,
  ORDER_STATUS.PENDING_SIGN,
  ORDER_STATUS.PENDING_FINAL
];

async function bind(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, mdm: true });
    assertOrderAccess(order, actor);
    assert(EDITABLE_STATUSES.includes(order.status), 409, 'INVALID_STATE', '当前状态不可登记 MDM 绑定结果');
    const serial = text(payload.serial, '监管锁序列号').replace(/\s/g, '');
    assert(serial.length >= 4, 400, 'VALIDATION_ERROR', '请填写正确的监管锁序列号');
    const before = order.mdm ? { serial: order.mdm.serial, bound: order.mdm.bound } : null;
    const now = new Date();
    const data = {
      serial,
      bound: true,
      provider: 'zhunfu_manual',
      boundAt: now,
      boundBy: actor.name,
      releasedAt: null,
      releasedBy: null,
      releaseNote: null
    };
    await tx.mdmRecord.upsert({ where: { orderId: order.id }, create: { orderId: order.id, imei: order.device?.imei || '', ...data }, update: data });
    const prevBound = order.mdm && order.mdm.bound;
    const action = prevBound ? '修改监管锁序列号' : '登记监管锁序列号';
    const note = prevBound
      ? `序列号变更：${before.serial || '—'} → ${serial}`
      : `序列号：${serial}（本系统仅保存记录，不连接 MDM 接口）`;
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action,
      before,
      after: { serial, bound: true, boundBy: actor.name, boundAt: now },
      note
    });
    await maybeAdvanceToFinal(tx, order.id, actor, '签约成功且 MDM 已登记，自动流转终审');
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

async function unbind(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const order = await findOrder(tx, id, { customer: true, mdm: true });
    assertOrderAccess(order, actor);
    assert(EDITABLE_STATUSES.includes(order.status), 409, 'INVALID_STATE', '当前状态不可解除 MDM 绑定记录');
    assert(order.mdm && order.mdm.bound, 409, 'MDM_NOT_BOUND', '当前未登记有效的 MDM 绑定结果');
    const note = text(payload.note, '解绑原因');
    const updatedMdm = await tx.mdmRecord.update({
      where: { orderId: order.id },
      data: { bound: false, releasedAt: new Date(), releasedBy: actor.name, releaseNote: note }
    });
    if (order.status === ORDER_STATUS.PENDING_FINAL) {
      await tx.order.update({ where: { id: order.id }, data: { status: ORDER_STATUS.PENDING_FIRST, firstReview: Prisma.DbNull } });
    }
    await audit(tx, {
      orderId: order.id,
      storeId: order.storeId,
      actor,
      action: '解除 MDM 绑定记录',
      before: order.mdm,
      after: { ...updatedMdm, orderStatus: order.status === ORDER_STATUS.PENDING_FINAL ? ORDER_STATUS.PENDING_FIRST : order.status },
      note
    });
    const updated = await findOrder(tx, order.id, detailInclude);
    return toOrderDto(updated);
  });
}

module.exports = { bind, unbind };
