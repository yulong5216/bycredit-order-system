const { randomInt, randomUUID } = require('node:crypto');

function orderNumber(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `N${date}${String(now.getTime()).slice(-5)}${randomInt(100, 1000)}`;
}

function requestNumber(now = new Date()) {
  return `PAY${now.toISOString().slice(0, 10).replaceAll('-', '')}${randomInt(100000, 1000000)}${randomUUID().slice(0, 4).toUpperCase()}`;
}

function mockContractNumber(attempt) {
  return `MOCK-ESIGN-${Date.now()}-${attempt}`;
}

module.exports = { orderNumber, requestNumber, mockContractNumber };
