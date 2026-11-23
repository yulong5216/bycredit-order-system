const bcrypt = require('bcrypt');
const config = require('../config');
const { assert } = require('../domain/errors');
const { phone, text } = require('../utils/validation');

function staffDto(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    storeName: user.store ? user.store.name : '',
    type: 'staff'
  };
}

async function login(app, payload) {
  const username = text(payload.username, '账号');
  const password = text(payload.password, '密码');
  const user = await app.prisma.user.findUnique({ where: { username }, include: { store: true } });
  assert(user && user.active, 401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  const matches = await bcrypt.compare(password, user.passwordHash);
  assert(matches, 401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  const dto = staffDto(user);
  const token = app.jwt.sign({ sub: user.id, ...dto });
  return { token, user: dto };
}

async function customerLogin(app, payload) {
  assert(!config.isProduction, 503, 'CUSTOMER_AUTH_DISABLED', '正式客户身份认证尚未接入，生产环境不可使用演示验证码');
  const customerPhone = phone(payload.phone);
  assert(payload.code === config.customerDemoOtp, 401, 'INVALID_CREDENTIALS', '手机号或验证码不正确');
  const customer = await app.prisma.customer.findFirst({
    where: { phone: customerPhone },
    include: { order: true },
    orderBy: { createdAt: 'desc' }
  });
  assert(customer && customer.order, 404, 'CUSTOMER_NOT_FOUND', '该手机号名下暂无订单');
  const dto = { id: customer.id, name: customer.name, phone: customer.phone, role: 'customer', type: 'customer' };
  const token = app.jwt.sign({ sub: customer.id, ...dto });
  return { token, user: dto };
}

module.exports = { login, customerLogin, staffDto };
