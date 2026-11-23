const loanService = require('../services/loanService');
const orderService = require('../services/orderService');
const exportService = require('../services/exportService');

module.exports = async function financeRoutes(app) {
  app.get('/api/finance/orders', { preHandler: [app.authenticate, app.authorize('finance:review')] }, async request => orderService.listOrders(app.prisma, request.user, request.query));
  app.post('/api/finance/:orderId/approve', { preHandler: [app.authenticate, app.authorize('finance:review')] }, async request => loanService.approve(app.prisma, request.user, request.params.orderId, request.body));
  app.post('/api/finance/:orderId/reject', { preHandler: [app.authenticate, app.authorize('finance:review')] }, async request => loanService.reject(app.prisma, request.user, request.params.orderId, request.body));
  app.post('/api/finance/:orderId/payout', { preHandler: [app.authenticate, app.authorize('finance:payout')] }, async request => loanService.payout(app.prisma, request.user, request.params.orderId, request.body));
  app.get('/api/finance/export', { preHandler: [app.authenticate, app.authorize('finance:export')] }, async (request, reply) => {
    const csv = await exportService.financeExport(app.prisma, request.query);
    reply.type('text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="finance-${request.query.month || 'all'}.csv"`);
    return csv;
  });
};
