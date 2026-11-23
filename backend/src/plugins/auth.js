const fp = require('fastify-plugin');
const { can } = require('../domain/constants');
const { DomainError } = require('../domain/errors');

module.exports = fp(async function authPlugin(app) {
  app.decorate('authenticate', async function authenticate(request) {
    try {
      await request.jwtVerify();
    } catch {
      throw new DomainError(401, 'UNAUTHORIZED', '请先登录或重新登录');
    }
  });

  app.decorate('authorize', function authorize(action) {
    return async function checkPermission(request) {
      if (!request.user || request.user.type === 'customer' || !can(request.user.role, action)) {
        throw new DomainError(403, 'FORBIDDEN', '当前角色无权执行此操作');
      }
    };
  });

  app.decorate('customerOnly', async function customerOnly(request) {
    if (!request.user || request.user.type !== 'customer') {
      throw new DomainError(403, 'CUSTOMER_REQUIRED', '仅客户账号可执行此操作');
    }
  });
});
