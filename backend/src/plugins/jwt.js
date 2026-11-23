const fp = require('fastify-plugin');
const jwt = require('@fastify/jwt');
const config = require('../config');

module.exports = fp(async function jwtPlugin(app) {
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn }
  });
});
