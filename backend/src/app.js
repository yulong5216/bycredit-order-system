const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Prisma } = require('@prisma/client');
const config = require('./config');
const { DomainError } = require('./domain/errors');
const { enableBigIntJson } = require('./utils/bigint');

enableBigIntJson();

async function buildApp(options = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: true });
  await app.register(require('@fastify/multipart'), { limits: { fileSize: config.uploadMaxBytes, files: 1 } });
  await app.register(require('./plugins/prisma'));
  await app.register(require('./plugins/jwt'));
  await app.register(require('./plugins/auth'));

  await app.register(require('./routes/health'));
  await app.register(require('./routes/auth'));
  await app.register(require('./routes/orders'));
  await app.register(require('./routes/payments'));
  await app.register(require('./routes/finance'));
  await app.register(require('./routes/stores'));
  await app.register(require('./routes/teams'));
  await app.register(require('./routes/users'));
  await app.register(require('./routes/customers'));
  await app.register(require('./routes/logs'));
  await app.register(require('./routes/collection'));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      reply.code(error.statusCode).send({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      reply.code(409).send({ code: 'DUPLICATE', message: '编号或交易号已存在，请勿重复提交' });
      return;
    }
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
      reply.code(401).send({ code: 'UNAUTHORIZED', message: '请先登录或重新登录' });
      return;
    }
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode === 500) request.log.error(error);
    reply.code(statusCode).send({ code: error.code || 'INTERNAL_ERROR', message: statusCode === 500 ? '服务器处理失败，请稍后重试' : error.message });
  });

  app.setNotFoundHandler((request, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: '接口不存在' }));
  return app;
}

module.exports = { buildApp, config };
