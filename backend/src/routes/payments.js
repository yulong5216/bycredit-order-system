const paymentService = require('../services/paymentService');
const billService = require('../services/billService');
const { can } = require('../domain/constants');
const { DomainError } = require('../domain/errors');

function paymentPermission(action) {
  return async function checkPaymentPermission(request) {
    if (request.user.type === 'customer') return;
    if (!can(request.user.role, action)) throw new DomainError(403, 'FORBIDDEN', '当前角色无权执行此支付操作');
  };
}

module.exports = async function paymentRoutes(app) {
  const customerOrFinance = action => [app.authenticate, paymentPermission(action)];
  app.post('/api/payment/generate', { preHandler: customerOrFinance('payment:create') }, async request => paymentService.generate(app.prisma, request.user, request.body));
  app.post('/api/payment/:requestNo/mock-result', { preHandler: customerOrFinance('payment:create') }, async request => paymentService.applyMockResult(app.prisma, request.user, request.params.requestNo, request.body));
  app.get('/api/payment/status', { preHandler: customerOrFinance('payment:view') }, async request => paymentService.status(app.prisma, request.user, request.query.requestNo));
  app.get('/api/bills', { preHandler: [app.authenticate, app.authorize('order:view')] }, async request => billService.listBills(app.prisma, request.user, request.query));
  app.get('/api/orders/:id/bills', { preHandler: [app.authenticate, app.authorize('order:view')] }, async request => billService.orderBills(app.prisma, request.user, request.params.id));
  app.post('/api/orders/:id/bills/:period/pay', { preHandler: [app.authenticate, app.authorize('bill:manual-pay')] }, async request => paymentService.manualPay(app.prisma, request.user, request.params.id, request.params.period, request.body));
  app.post('/api/orders/:id/bills/:period/defer', { preHandler: [app.authenticate, app.authorize('bill:defer')] }, async request => billService.defer(app.prisma, request.user, request.params.id, request.params.period, request.body));
  app.post('/api/orders/:id/bills/:period/breach', { preHandler: [app.authenticate, app.authorize('bill:breach')] }, async request => billService.breach(app.prisma, request.user, request.params.id, request.params.period, request.body));
};
