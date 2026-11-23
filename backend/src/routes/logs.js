const orderService = require('../services/orderService');
const { assert } = require('../domain/errors');

module.exports = async function logRoutes(app) {
  app.get('/api/logs/order/:orderId', { preHandler: [app.authenticate, app.authorize('order:view')] }, async request => {
    const order = await orderService.getOrder(app.prisma, request.user, request.params.orderId);
    return { items: order.logs, total: order.logs.length };
  });
  app.get('/api/logs/store/:storeId', { preHandler: [app.authenticate, app.authorize('store:view')] }, async request => {
    if (['manager', 'sales'].includes(request.user.role)) {
      assert(request.user.storeId === request.params.storeId, 403, 'FORBIDDEN', '只能查看本店操作日志');
    }
    const items = await app.prisma.auditLog.findMany({ where: { storeId: request.params.storeId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items, total: items.length };
  });
};
