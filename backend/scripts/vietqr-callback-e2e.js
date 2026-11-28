// VietQR 回调流程端到端测试
// 模拟 VietQR 完整流程: /token → /sync → 验证销账

const http = require('http');

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3001');
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: chunks ? JSON.parse(chunks) : {} }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('\n=== VietQR 回调端到端测试 ===\n');

  // Step 1: VietQR 拿 token
  const basicAuth = 'Basic ' + Buffer.from('vietqr_sync:vietqr_sync_pass_2026').toString('base64');
  const t1 = await request('POST', '/api/vietqr/callback/token', {}, { Authorization: basicAuth });
  console.log(`[1] /token → ${t1.status}`);
  console.log(`    token: ${t1.body.access_token?.slice(0, 50)}...`);
  if (t1.status !== 200) { console.log('❌ token 拿不到'); process.exit(1); }
  const tok = t1.body.access_token;

  // Step 2: 登录 finance，找个待还账单
  const fl = await request('POST', '/api/auth/login', { username: 'finance', password: 'qwe123' });
  if (fl.status !== 200) { console.log(`❌ 登录失败: ${JSON.stringify(fl.body)}`); process.exit(1); }
  const ftok = fl.body.data.token;
  const orders = await request('GET', '/api/orders', null, { Authorization: 'Bearer ' + ftok });
  const items = orders.body?.data?.items || [];
  let orderItem = null, billItem = null;
  for (const o of items) {
    for (const b of o.bills || []) {
      if (b.status !== 'Paid') { orderItem = o; billItem = b; break; }
    }
    if (billItem) break;
  }
  if (!billItem) { console.log('❌ 没有待还账单可测'); process.exit(1); }
  console.log(`[2] 选 order=${orderItem.orderNo} P${billItem.period} amount=${billItem.amount}`);

  // Step 3: 模拟 VietQR 推 sync
  const txnId = `TEST-TXN-${billItem.period}-${Date.now()}`;
  const sync = await request('POST', '/api/vietqr/callback/sync', {
    bankaccount: '0071000999888',
    amount: Number(billItem.amount),
    transType: 'C',
    content: `PTEST KY HOAN ${billItem.period}`,
    transactionid: txnId,
    transactiontime: Date.now(),
    referencenumber: 'MB20261128TEST',
    orderId: `${orderItem.orderNo}-P${billItem.period}`
  }, { Authorization: 'Bearer ' + tok });
  console.log(`[3] /sync → ${sync.status} ${JSON.stringify(sync.body)}`);

  // Step 4: 查订单详情，确认销账
  const det = await request('GET', '/api/orders/' + orderItem.id, null, { Authorization: 'Bearer ' + ftok });
  const bills = det.body?.data?.bills || [];
  const b = bills.find(x => x.period === billItem.period);
  console.log(`[4] P${billItem.period} 状态: ${b.status}  channel=${b.channel}  txnNo=${b.txnNo}`);
  console.log(`    订单总状态: ${det.body?.data?.status}`);

  if (b.status === 'Paid' && b.txnNo === txnId) {
    console.log('\n✅ 回调销账成功！整个 VietQR 支付闭环跑通了！\n');
  } else {
    console.log(`\n❌ 销账没生效：期望 Paid / ${txnId}，实际 ${b.status} / ${b.txnNo}\n`);
    process.exit(1);
  }
})();
