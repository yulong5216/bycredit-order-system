const { text } = require('../utils/validation');
const { assert } = require('../domain/errors');

function start({ attempt }) {
  return {
    provider: 'mock',
    providerStatus: 'demo_pending',
    isMock: true,
    rawCallback: { demo: true, message: '仅创建演示签约次数，未创建真实合同或发送短信', attempt }
  };
}

function parseResult(payload) {
  const ok = payload.ok === true;
  const contractNo = text(payload.contractNo, '演示合同号', ok);
  const reason = text(payload.reason, '失败原因', !ok);
  if (ok) assert(contractNo.toUpperCase().startsWith('MOCK-'), 400, 'MOCK_CONTRACT_REQUIRED', '演示合同号必须以 MOCK- 开头');
  return {
    ok,
    externalContractNo: contractNo || null,
    providerStatus: ok ? 'demo_succeeded' : 'demo_failed',
    failureReason: ok ? '' : reason,
    isMock: true,
    rawCallback: { demo: true, ...payload }
  };
}

module.exports = { start, parseResult };
