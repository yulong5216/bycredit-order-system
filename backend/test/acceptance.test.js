const test = require('node:test');
const assert = require('node:assert/strict');

if (!process.env.TEST_DATABASE_URL) {
  test('MySQL 全链路验收（设置 TEST_DATABASE_URL 后运行）', { skip: '当前未配置独立 MySQL 测试库' }, () => {});
} else {
  assert.match(process.env.TEST_DATABASE_URL, /bycredit_(test|demo)/, '验收测试只允许清空独立测试/演示库');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.ESIGN_PROVIDER = 'mock';
  process.env.CUSTOMER_DEMO_OTP = '123456';
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { randomUUID } = require('node:crypto');
  const uploadDir = path.join(os.tmpdir(), `bycredit-acceptance-${randomUUID()}`);
  process.env.UPLOAD_DIR = uploadDir;
  const bcrypt = require('bcrypt');
  const { buildApp } = require('../src/app');
  const requiredDocs = ['id_front', 'id_back', 'selfie', 'work_proof', 'bank_statement', 'staff_customer_photo', 'phone_verify', 'imei_photo', 'address_photo'];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  function fileUpload(key) {
    const boundary = `----bycredit-${key}`;
    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${key}.png"\r\nContent-Type: image/png\r\n\r\n`),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ])
    };
  }

  test('录单→签约失败重试→MDM→终审→放款→mock/人工还款→结清', async t => {
    const app = await buildApp({ logger: false });
    t.after(async () => {
      await app.close();
      await fs.rm(uploadDir, { recursive: true, force: true });
    });
    const prisma = app.prisma;
    await prisma.auditLog.deleteMany();
    await prisma.paymentRequest.deleteMany();
    await prisma.esignAttempt.deleteMany();
    await prisma.mdmRecord.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.order.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.store.deleteMany();

    const store = await prisma.store.create({ data: { code: 'TEST', name: 'Test Store', status: 'active', rating: 'A', payee: { bank: 'Test Bank', account: '123456', holder: 'Test Store' } } });
    const passwordHash = await bcrypt.hash('Test123!', 4);
    const roleUsers = [['sales', 'sales'], ['sales2', 'sales'], ['first', 'first'], ['final', 'final'], ['finance', 'finance']];
    for (const [username, role] of roleUsers) {
      await prisma.user.create({ data: { username, name: username, role, passwordHash, storeId: role === 'sales' ? store.id : null } });
    }
    const tokens = {};
    for (const [username] of roleUsers) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'Test123!' } });
      assert.equal(response.statusCode, 200, response.body);
      tokens[username] = response.json().token;
    }
    const auth = role => ({ authorization: `Bearer ${tokens[role]}` });
    const orderPayload = {
      customer: { name: 'Nguyen Test', idNo: '001234567890', phone: '0901234567', address: 'Da Nang', emergencyName: 'Tran Test', emergencyRelation: 'Anh', emergencyPhone: '0907654321' },
      device: { model: 'iPhone 13', imei: '123456789012345', capacity: '128GB' },
      docs: {},
      plan: { storeId: store.id, price: 12000000, periods: 3, rateBps: 500, firstDueDate: '2027-01-15' },
      payee: { bank: 'Test Bank', account: '123456', holder: 'Test Store' }
    };
    const metadataCreate = await app.inject({ method: 'POST', url: '/api/orders', headers: auth('sales'), payload: { ...orderPayload, docs: { id_front: { name: 'fake.png', storageName: 'fake.png' } } } });
    assert.equal(metadataCreate.statusCode, 400, '创建订单不能伪造影像元数据');
    const created = await app.inject({ method: 'POST', url: '/api/orders', headers: auth('sales'), payload: orderPayload });
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json();
    assert.equal(order.status, 'draft');
    const url = `/api/orders/${order.id}`;

    const metadataUpdate = await app.inject({ method: 'PUT', url, headers: auth('sales'), payload: { docs: { id_front: { name: 'fake.png', storageName: 'fake.png' } } } });
    assert.equal(metadataUpdate.statusCode, 400, '通用更新接口不能伪造影像元数据');
    const foreignPart = fileUpload('id_front');
    const foreignUpload = await app.inject({ method: 'POST', url: `${url}/docs/id_front`, headers: { ...auth('sales2'), ...foreignPart.headers }, payload: foreignPart.payload });
    assert.equal(foreignUpload.statusCode, 403, '其他业务员不能上传本订单影像');
    const rolePart = fileUpload('id_front');
    const roleUpload = await app.inject({ method: 'POST', url: `${url}/docs/id_front`, headers: { ...auth('final'), ...rolePart.headers }, payload: rolePart.payload });
    assert.equal(roleUpload.statusCode, 403, '无 order:update 权限的角色不能上传');

    for (const key of requiredDocs) {
      const part = fileUpload(key);
      const uploaded = await app.inject({ method: 'POST', url: `${url}/docs/${key}`, headers: { ...auth('sales'), ...part.headers }, payload: part.payload });
      assert.equal(uploaded.statusCode, 200, uploaded.body);
      assert.ok(uploaded.json().docs[key].storageName, `${key} 应返回受控存储文件名`);
    }
    const foreignDownload = await app.inject({ method: 'GET', url: `${url}/docs/id_front/content`, headers: auth('sales2') });
    assert.equal(foreignDownload.statusCode, 403, '其他业务员不能下载本订单影像');
    const anonymousDownload = await app.inject({ method: 'GET', url: `${url}/docs/id_front/content` });
    assert.equal(anonymousDownload.statusCode, 401);
    const downloaded = await app.inject({ method: 'GET', url: `${url}/docs/id_front/content`, headers: auth('sales') });
    assert.equal(downloaded.statusCode, 200, downloaded.body);
    assert.equal(downloaded.headers['content-type'], 'image/png');
    assert.match(downloaded.headers['content-disposition'], /^attachment;/);
    assert.equal(downloaded.headers['x-content-type-options'], 'nosniff');
    assert.ok(downloaded.rawPayload.equals(png), '下载内容必须与实际上传文件一致');
    const submitted = await app.inject({ method: 'POST', url: `${url}/submit`, headers: auth('sales'), payload: {} });
    assert.equal(submitted.statusCode, 200, submitted.body);
    assert.equal(submitted.json().status, 'pending_first');

    const forbidden = await app.inject({ method: 'POST', url: `${url}/final-review`, headers: auth('sales'), payload: { result: 'pass' } });
    assert.equal(forbidden.statusCode, 403);
    let response = await app.inject({ method: 'POST', url: `${url}/esign/start`, headers: auth('first'), payload: {} });
    assert.equal(response.json().status, 'pending_customer_sign', response.body);
    response = await app.inject({ method: 'POST', url: `${url}/esign/simulate`, headers: auth('first'), payload: { ok: false, reason: '演示失败' } });
    assert.equal(response.json().status, 'pending_first');
    response = await app.inject({ method: 'POST', url: `${url}/esign/start`, headers: auth('first'), payload: {} });
    assert.equal(response.json().esign.attempt, 2);
    response = await app.inject({ method: 'POST', url: `${url}/esign/simulate`, headers: auth('first'), payload: { ok: true, contractNo: 'MOCK-CONTRACT-001' } });
    assert.equal(response.json().status, 'pending_first');
    response = await app.inject({ method: 'POST', url: `${url}/mdm/bind`, headers: auth('first'), payload: { serial: 'ZF-DEMO-123456', imei: '123456789012345' } });
    assert.equal(response.json().status, 'pending_final', response.body);
    response = await app.inject({ method: 'POST', url: `${url}/final-review`, headers: auth('final'), payload: { result: 'pass', note: '终审通过' } });
    assert.equal(response.json().status, 'pending_finance');
    response = await app.inject({ method: 'POST', url: `/api/finance/${order.id}/approve`, headers: auth('finance'), payload: {} });
    assert.equal(response.json().status, 'pending_payout');
    response = await app.inject({ method: 'POST', url: `/api/finance/${order.id}/payout`, headers: auth('finance'), payload: { ref: 'BANK-RECEIPT-001' } });
    assert.equal(response.json().status, 'repaying');
    assert.equal(response.json().bills.length, 3);
    assert.equal(response.json().bills[2].amount, 4600000);
    const lockedPart = fileUpload('other');
    const lockedUpload = await app.inject({ method: 'POST', url: `${url}/docs/other`, headers: { ...auth('sales'), ...lockedPart.headers }, payload: lockedPart.payload });
    assert.equal(lockedUpload.statusCode, 409, '放款后不能继续修改影像');

    const customerLogin = await app.inject({ method: 'POST', url: '/api/auth/customer-login', payload: { phone: '0901234567', code: '123456' } });
    assert.equal(customerLogin.statusCode, 200, customerLogin.body);
    const customerAuth = { authorization: `Bearer ${customerLogin.json().token}` };
    response = await app.inject({ method: 'POST', url: '/api/payment/generate', headers: customerAuth, payload: { orderId: order.id, period: 1 } });
    const payment = response.json();
    assert.equal(payment.demo, true);
    assert.equal(payment.qrLink, null);
    response = await app.inject({ method: 'POST', url: `/api/payment/${payment.requestNo}/mock-result`, headers: customerAuth, payload: { ok: true } });
    assert.equal(response.json().status, 'succeeded', response.body);
    await app.inject({ method: 'POST', url: `/api/payment/${payment.requestNo}/mock-result`, headers: customerAuth, payload: { ok: true } });
    assert.equal(await prisma.paymentRequest.count({ where: { externalTxnNo: `MOCK-TXN-${payment.requestNo}`, status: 'succeeded' } }), 1);

    response = await app.inject({ method: 'POST', url: `${url}/bills/2/pay`, headers: auth('finance'), payload: { txnNo: 'MANUAL-001', channel: 'bank_transfer', paidAt: '2026-12-01T02:00:00.000Z', note: '人工到账' } });
    assert.equal(response.statusCode, 200, response.body);
    response = await app.inject({ method: 'POST', url: `${url}/bills/2/pay`, headers: auth('finance'), payload: { txnNo: 'MANUAL-001', channel: 'bank_transfer', paidAt: '2026-12-01T02:00:00.000Z' } });
    assert.equal(response.statusCode, 409);

    response = await app.inject({ method: 'POST', url: '/api/payment/generate', headers: customerAuth, payload: { orderId: order.id, period: 3 } });
    const wrongPayment = response.json();
    response = await app.inject({ method: 'POST', url: `/api/payment/${wrongPayment.requestNo}/mock-result`, headers: customerAuth, payload: { ok: true, amount: 1 } });
    assert.equal(response.statusCode, 409);
    assert.equal((await prisma.bill.findUnique({ where: { orderId_period: { orderId: order.id, period: 3 } } })).status, 'Pending');
    response = await app.inject({ method: 'POST', url: '/api/payment/generate', headers: customerAuth, payload: { orderId: order.id, period: 3 } });
    const lastPayment = response.json();
    await app.inject({ method: 'POST', url: `/api/payment/${lastPayment.requestNo}/mock-result`, headers: customerAuth, payload: { ok: true } });
    const closed = await app.inject({ method: 'GET', url, headers: auth('finance') });
    assert.equal(closed.json().status, 'closed');
    assert.ok(closed.json().bills.every(bill => bill.status === 'Paid'));

    const csv = await app.inject({ method: 'GET', url: '/api/finance/export', headers: auth('finance') });
    assert.equal(csv.statusCode, 200);
    const line = csv.body.split('\r\n').find(item => item.includes(order.orderNo));
    const columns = line.split(',');
    assert.equal(columns.length, 17);
    assert.equal(columns[8], '3333333', '财务导出只能统计人工真实回款，不能包含 mock');
    const logs = await app.inject({ method: 'GET', url: `/api/logs/order/${order.id}`, headers: auth('finance') });
    assert.ok(logs.json().items.some(item => item.action === '演示支付到账并销账'));
    assert.ok(logs.json().items.some(item => item.action === '代客登记还款并销账'));
  });
}
