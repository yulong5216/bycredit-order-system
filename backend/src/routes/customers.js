const customerService = require('../services/customerService');
const orderService = require('../services/orderService');
const billService = require('../services/billService');

module.exports = async function customerRoutes(app) {
  app.get('/api/customers', { preHandler: [app.authenticate, app.authorize('order:view')] }, async request => customerService.list(app.prisma, request.user, request.query));
  app.get('/api/customer/orders', { preHandler: [app.authenticate, app.customerOnly] }, async request => orderService.listOrders(app.prisma, request.user, request.query));
  app.get('/api/customer/orders/:id', { preHandler: [app.authenticate, app.customerOnly] }, async request => orderService.getOrder(app.prisma, request.user, request.params.id));
  app.get('/api/customer/orders/:id/bills', { preHandler: [app.authenticate, app.customerOnly] }, async request => billService.orderBills(app.prisma, request.user, request.params.id));
};
