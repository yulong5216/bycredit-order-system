async function list(prisma, actor, query) {
  const orderWhere = {};
  if (actor.role === 'sales') orderWhere.salesId = actor.sub;
  if (actor.role === 'manager') orderWhere.storeId = actor.storeId;
  if (actor.role === 'collector') orderWhere.status = { in: ['overdue', 'breach'] };
  const where = { order: orderWhere };
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { idNo: { contains: q } }];
  }
  const records = await prisma.customer.findMany({
    where,
    include: { order: { include: { store: true, bills: true } } },
    orderBy: { createdAt: 'desc' }
  });
  const groups = new Map();
  for (const customer of records) {
    const existing = groups.get(customer.idNo);
    const item = {
      id: customer.id,
      name: customer.name,
      idType: customer.idType,
      idNo: customer.idNo,
      phone: customer.phone,
      storeName: customer.order.store.name,
      salesName: customer.order.salesName,
      orderCount: existing ? existing.orderCount + 1 : 1,
      latestOrderId: customer.order.id,
      latestOrderNo: customer.order.orderNo,
      latestStatus: customer.order.status,
      createdAt: customer.createdAt
    };
    if (existing) {
      existing.orderCount++;
      existing.history = existing.history || [];
      existing.history.push({ orderId: item.latestOrderId, orderNo: item.latestOrderNo, status: item.latestStatus });
    } else groups.set(customer.idNo, item);
  }
  const items = [...groups.values()];
  return { items, total: items.length };
}

module.exports = { list };
