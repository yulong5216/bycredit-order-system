const { randomInt, randomUUID } = require('node:crypto');

// 用户指定格式: L + YYYYMMDD + 9位毫秒时间戳（确保唯一）
function orderNumber(now = new Date()) {
  const d = now;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  // 毫秒时间戳转 9 位（取后 9 位，冲突概率极低）
  const ms = String(d.getTime()).slice(-9);
  return `L${y}${m}${day}${hh}${mm}${ss}${ms}`;
}

function requestNumber(now = new Date()) {
  return `PAY${now.toISOString().slice(0, 10).replaceAll('-', '')}${randomInt(100000, 1000000)}${randomUUID().slice(0, 4).toUpperCase()}`;
}

function mockContractNumber(attempt) {
  return `MOCK-ESIGN-${Date.now()}-${attempt}`;
}

module.exports = { orderNumber, requestNumber, mockContractNumber };
