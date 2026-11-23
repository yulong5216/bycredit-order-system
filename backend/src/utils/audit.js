const { Prisma } = require('@prisma/client');

function jsonValue(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? Number(item) : item));
}

async function audit(tx, { orderId, storeId, actor, action, before, after, note }) {
  return tx.auditLog.create({
    data: {
      orderId: orderId || null,
      storeId: storeId || null,
      actorId: actor && actor.type !== 'customer' ? actor.sub : null,
      actorName: actor && actor.name ? actor.name : '系统',
      actorRole: actor && actor.role ? actor.role : 'system',
      action,
      before: jsonValue(before) === null ? Prisma.DbNull : jsonValue(before),
      after: jsonValue(after) === null ? Prisma.DbNull : jsonValue(after),
      note: note || ''
    }
  });
}

module.exports = { audit };
