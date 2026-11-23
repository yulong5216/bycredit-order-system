const authService = require('../services/authService');
const { staffDto } = require('../services/authService');
const { DomainError } = require('../domain/errors');

module.exports = async function authRoutes(app) {
  app.post('/api/auth/login', async request => authService.login(app, request.body));
  app.post('/api/auth/customer-login', async request => authService.customerLogin(app, request.body));
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async request => {
    if (request.user.type === 'customer') return request.user;
    const user = await app.prisma.user.findUnique({ where: { id: request.user.sub }, include: { store: true } });
    if (!user || !user.active) throw new DomainError(401, 'UNAUTHORIZED', '账号已停用');
    return staffDto(user);
  });
};
