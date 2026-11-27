const { createReadStream } = require('node:fs');
const orderService = require('../services/orderService');
const documentService = require('../services/documentService');
const mdmService = require('../services/mdmService');
const esignService = require('../services/esignService');
const mockEsignProvider = require('../providers/mockEsignProvider');
const integration = require('../config/integration');
const { assert } = require('../domain/errors');

module.exports = async function orderRoutes(app) {
  const permission = action => [app.authenticate, app.authorize(action)];

  app.get('/api/orders', { preHandler: permission('order:view') }, async request => orderService.listOrders(app.prisma, request.user, request.query));
  app.post('/api/orders', { preHandler: permission('order:create') }, async (request, reply) => {
    const order = await orderService.createOrder(app.prisma, request.user, request.body);
    reply.code(201);
    return order;
  });
  app.get('/api/orders/:id', { preHandler: permission('order:view') }, async request => orderService.getOrder(app.prisma, request.user, request.params.id));
  app.put('/api/orders/:id', { preHandler: permission('order:update') }, async request => orderService.updateOrder(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/docs/:key', { preHandler: permission('order:update') }, async request => {
    const file = await request.file();
    return documentService.uploadDocument(app.prisma, request.user, request.params.id, request.params.key, file);
  });
  app.get('/api/orders/:id/docs/:key/content', { preHandler: permission('order:view') }, async (request, reply) => {
    const { doc, target, size } = await documentService.getDocument(app.prisma, request.user, request.params.id, request.params.key);
    reply
      .type(doc.type || 'application/octet-stream')
      .header('Content-Length', size)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox");
    return reply.send(createReadStream(target));
  });
  app.post('/api/orders/:id/submit', { preHandler: permission('order:submit') }, async request => orderService.submitOrder(app.prisma, request.user, request.params.id));
  app.post('/api/orders/:id/first-review', { preHandler: permission('order:first-review') }, async request => orderService.reviewFirst(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/final-review', { preHandler: permission('order:final-review') }, async request => orderService.reviewFinal(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/send-finance', { preHandler: permission('order:send-finance') }, async request => orderService.sendToFinance(app.prisma, request.user, request.params.id));
  app.post('/api/orders/:id/cancel', { preHandler: permission('order:cancel') }, async request => orderService.cancelOrder(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/notes', { preHandler: permission('order:note') }, async request => orderService.addNote(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/contact-attempt', { preHandler: [app.authenticate] }, async request => orderService.contactAttempt(app.prisma, request.user, request.params.id, request.body));
  app.put('/api/orders/:id/plan', { preHandler: permission('order:plan') }, async request => orderService.updatePlan(app.prisma, request.user, request.params.id, request.body));
  app.put('/api/orders/:id/due-date', { preHandler: permission('order:plan') }, async request => orderService.changeDueDate(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/mdm/bind', { preHandler: permission('mdm:bind') }, async request => mdmService.bind(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/orders/:id/mdm/unbind', { preHandler: permission('mdm:bind') }, async request => mdmService.unbind(app.prisma, request.user, request.params.id, request.body));

  app.post('/api/orders/:id/esign/start', { preHandler: permission('esign:start') }, async request => {
    assert(integration.esignProvider === 'mock', 503, 'ESIGN_DISABLED', '电子签约当前未启用');
    return esignService.start(app.prisma, request.user, request.params.id, mockEsignProvider);
  });
  app.post('/api/orders/:id/esign/simulate', { preHandler: permission('esign:result') }, async request => {
    assert(integration.esignProvider === 'mock', 404, 'NOT_FOUND', '接口不存在');
    const result = mockEsignProvider.parseResult(request.body);
    return esignService.applyResult(app.prisma, request.user, request.params.id, result);
  });
};
