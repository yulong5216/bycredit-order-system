const test = require('node:test');
const assert = require('node:assert/strict');
const { settlePayment } = require('../src/services/paymentService');

function fixture() {
  const state = {
    order: { id: 'order-1', storeId: 'store-1', status: 'repaying', customer: { phone: '0901234567' } },
    bills: [
      { id: 'bill-1', orderId: 'order-1', period: 1, amount: 100n, paidAmount: 0n, status: 'Pending', note: '' },
      { id: 'bill-2', orderId: 'order-1', period: 2, amount: 100n, paidAmount: 0n, status: 'Pending', note: '' }
    ],
    payments: [
      { id: 'payment-1', requestNo: 'PAY-1', orderId: 'order-1', billId: 'bill-1', amount: 100n, channel: 'mock_qr', status: 'pending', isMock: true, externalTxnNo: null, failureReason: '' },
      { id: 'payment-2', requestNo: 'PAY-2', orderId: 'order-1', billId: 'bill-2', amount: 100n, channel: 'bank_transfer', status: 'pending', isMock: false, externalTxnNo: null, failureReason: '' }
    ],
    logs: []
  };
  const paymentWithRelations = payment => ({ ...payment, bill: state.bills.find(bill => bill.id === payment.billId), order: { ...state.order, customer: state.order.customer } });
  const tx = {
    paymentRequest: {
      async findUnique({ where }) {
        const payment = state.payments.find(item => item.requestNo === where.requestNo);
        return payment ? paymentWithRelations(payment) : null;
      },
      async findFirst({ where }) {
        return state.payments.find(item => item.id !== where.id.not && item.channel === where.channel && item.externalTxnNo === where.externalTxnNo && item.status === where.status) || null;
      },
      async update({ where, data }) {
        const index = state.payments.findIndex(item => item.id === where.id);
        state.payments[index] = { ...state.payments[index], ...data };
        return { ...state.payments[index] };
      }
    },
    bill: {
      async update({ where, data }) {
        const index = state.bills.findIndex(item => item.id === where.id);
        state.bills[index] = { ...state.bills[index], ...data };
        return { ...state.bills[index] };
      },
      async findMany() { return state.bills; }
    },
    order: {
      async update({ data }) { state.order = { ...state.order, ...data }; return state.order; }
    },
    auditLog: {
      async create({ data }) { state.logs.push(data); return data; }
    }
  };
  return { state, prisma: { $transaction: work => work(tx) } };
}

function params(requestNo = 'PAY-1') {
  const mock = requestNo === 'PAY-1';
  return { requestNo, externalTxnNo: mock ? 'MOCK-TXN-1' : 'BANK-TXN-1', amount: 100n, channel: mock ? 'mock_qr' : 'bank_transfer', isMock: mock, actor: { name: '测试员', role: 'finance', sub: 'finance-1' } };
}

test('支付幂等：重复成功通知不重复销账，最后一期后订单结清', async () => {
  const { prisma, state } = fixture();
  const first = await settlePayment(prisma, params('PAY-1'));
  assert.equal(first.duplicate, false);
  assert.equal(state.bills[0].status, 'Paid');
  assert.equal(state.bills[0].paidAmount, 100n);
  assert.equal(state.order.status, 'repaying');
  const repeated = await settlePayment(prisma, params('PAY-1'));
  assert.equal(repeated.duplicate, true);
  assert.equal(state.bills[0].paidAmount, 100n);
  await settlePayment(prisma, params('PAY-2'));
  assert.equal(state.order.status, 'closed');
  assert.ok(state.order.closedAt instanceof Date);
  assert.equal(state.payments.filter(payment => payment.status === 'succeeded').length, 2);
});

test('金额不一致仅记录异常，不修改账单和订单', async () => {
  const { prisma, state } = fixture();
  await assert.rejects(() => settlePayment(prisma, { ...params(), amount: 99n }), error => error.code === 'AMOUNT_MISMATCH');
  assert.equal(state.payments[0].status, 'exception');
  assert.equal(state.bills[0].status, 'Pending');
  assert.equal(state.bills[0].paidAmount, 0n);
  assert.equal(state.order.status, 'repaying');
  assert.equal(state.logs.at(-1).action, '支付金额异常');
});

test('相同渠道和外部交易号只能销账一次', async () => {
  const { prisma, state } = fixture();
  state.payments[1].channel = 'mock_qr';
  state.payments[1].isMock = true;
  await settlePayment(prisma, params('PAY-1'));
  const second = await settlePayment(prisma, { ...params('PAY-2'), channel: 'mock_qr', externalTxnNo: 'MOCK-TXN-1', isMock: true });
  assert.equal(second.duplicate, true);
  assert.equal(state.payments[1].status, 'duplicate');
  assert.equal(state.bills[1].status, 'Pending');
  assert.equal(state.bills[1].paidAmount, 0n);
});
