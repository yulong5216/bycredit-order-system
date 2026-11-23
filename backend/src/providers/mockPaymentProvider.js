function createRequest({ requestNo, amount, expiresAt }) {
  return {
    provider: 'mock',
    channel: 'mock_qr',
    isMock: true,
    rawResponse: {
      demo: true,
      requestNo,
      amount: String(amount),
      expiresAt: expiresAt.toISOString(),
      message: '演示支付不生成真实付款二维码，也不会发起真实扣款'
    }
  };
}

function successfulTransaction(requestNo) {
  return `MOCK-TXN-${requestNo}`;
}

module.exports = { createRequest, successfulTransaction };
