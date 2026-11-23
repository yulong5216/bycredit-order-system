const { createReadStream } = require('node:fs');
const storeService = require('../services/storeService');

module.exports = async function storeRoutes(app) {
  const permission = action => [app.authenticate, app.authorize(action)];
  app.get('/api/stores', { preHandler: permission('store:view') }, async request => storeService.list(app.prisma, request.user, request.query));
  app.post('/api/stores', { preHandler: permission('store:create') }, async (request, reply) => {
    reply.code(201);
    return storeService.create(app.prisma, request.user, request.body);
  });
  app.put('/api/stores/:id', { preHandler: permission('store:update') }, async request => storeService.update(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/stores/:id/payee-qr', { preHandler: permission('store:update') }, async request => {
    const file = await request.file();
    return storeService.uploadPayeeQr(app.prisma, request.user, request.params.id, file);
  });
  app.get('/api/stores/:id/payee-qr/content', { preHandler: permission('store:view') }, async (request, reply) => {
    const { qr, target, size } = await storeService.getPayeeQr(app.prisma, request.user, request.params.id);
    reply
      .type(qr.type || 'image/png')
      .header('Content-Length', size)
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(qr.name)}`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff');
    return reply.send(createReadStream(target));
  });
  app.post('/api/stores/:id/rating', { preHandler: permission('store:rating') }, async request => storeService.rating(app.prisma, request.user, request.params.id, request.body));
  app.post('/api/stores/:id/status', { preHandler: permission('store:status') }, async request => storeService.status(app.prisma, request.user, request.params.id, request.body));
};
