const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { buildApp } = require('../src/app');

const cwd = path.resolve(__dirname, '..');

function checkIntegration(env) {
  return spawnSync(process.execPath, ['-e', "require('./src/config/integration')"], {
    cwd,
    env: { ...process.env, DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/bycredit_test', ...env },
    encoding: 'utf8'
  });
}

test('生产环境启用 mock 支付或签约必须启动失败', () => {
  for (const env of [
    { NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock', ESIGN_PROVIDER: 'manual' },
    { NODE_ENV: 'production', PAYMENT_PROVIDER: 'manual', ESIGN_PROVIDER: 'mock' }
  ]) {
    const result = checkIntegration(env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /生产环境禁止启用 mock/);
  }
});

test('第一阶段不支持误配置真实 provider', () => {
  const result = checkIntegration({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'vietqr', ESIGN_PROVIDER: 'mock' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /尚未在第一阶段实现/);
});

test('应用可启动且健康检查明确展示演示能力', async t => {
  const app = await buildApp({ logger: false });
  t.after(() => app.close());
  const health = await app.inject('/api/health');
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json().demo, { payment: true, esign: true });
  const unauthorized = await app.inject('/api/orders');
  assert.equal(unauthorized.statusCode, 401);
});
