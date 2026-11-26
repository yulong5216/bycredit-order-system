// 干净地造 5 条不同状态的测试订单
const http = require('http');
const BASE = 'http://localhost:3001';

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const body = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers };
    const r = http.request(opts, res => {
      let c = '';
      res.on('data', d => c += d);
      res.on('end', () => {
        try { const j = JSON.parse(c); if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${j.message || c}`)); else resolve(j); }
        catch { resolve({ raw: c, status: res.statusCode }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  const sales = (await req('POST', '/api/auth/login', { username: 'sales', password: 'Bycredit123!' })).token;
  const first = (await req('POST', '/api/auth/login', { username: 'first', password: 'Bycredit123!' })).token;
  const final = (await req('POST', '/api/auth/login', { username: 'final', password: 'Bycredit123!' })).token;
  const fin   = (await req('POST', '/api/auth/login', { username: 'finance', password: 'Bycredit123!' })).token;
  const dnStore = (await req('GET', '/api/stores?size=100', null, sales)).items.find(s => s.code === 'DN');
  const storeId = dnStore.id;
  console.log(`✅ 登录成功，门店 DN=${storeId}`);

  // ====== 创建 4 个订单（全带 MDM+签约）======
  function customer(name, phone, idNo, rel) {
    return { name, idType: 'CCCD', idNo, phone, address: '123 Demo St', emergencyName: '紧急联系人', emergencyRelation: rel, emergencyPhone: '0' + phone.slice(1) + '9' };
  }
  function body(cust, imei, serial, price, periods) {
    return {
      submit: true,
      customer: cust,
      device: { model: 'iPhone 13', imei },
      plan: { storeId, price, periods, rateBps: 0 },
      payee: { bank: 'Vietcombank', account: '0071000999888', holder: 'CONG TY BY DN' },
      notes: '测试数据'
    };
  }

  const customers = [
    ['Nguyễn Văn An',    '0901234567', '001234567891', 'Vợ'],
    ['Trần Thị Bình',   '0912345678', '009876543210', 'Anh trai'],
    ['Lê Hoàng Cường',   '0923456789', '011223344556', 'Chị gái'],
    ['Phạm Minh Đức',   '0934567890', '022334455667', 'Vợ']
  ];
  const imeis   = ['352046123456789', '353311122233445', '355544433322111', '356789012345678'];
  const serials = ['SERIAL001', 'SERIAL002', 'SERIAL003', 'SERIAL004'];
  const prices  = [24000000, 28000000, 36000000, 30000000];

  // 批量创建 4 个订单（都先停在 pending_first）
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const o = await req('POST', '/api/orders', body(customer(...customers[i]), imeis[i], serials[i], prices[i], 12), sales);
    ids.push(o.id);
    console.log(`✅ 订单${i+1} 创建: ${o.orderNo} ${o.status}`);
    // MDM + 签约（signer 是 first 角色）
    await req('POST', `/api/orders/${o.id}/mdm/bind`, { serial: serials[i] }, first);
    await req('POST', `/api/orders/${o.id}/esign/start`, {}, first);
    await req('POST', `/api/orders/${o.id}/esign/simulate`, { ok: true, contractNo: 'MOCK-' + o.orderNo }, first);
    console.log(`   → MDM+签约完成，仍保持 pending_first（按你的要求）`);
  }

  // ====== 订单1：pending_first（不动）======
  console.log(`\n📌 订单1 保持 pending_first，客户手机号 ${customers[0][1]} — 用于客户页测试`);

  // ====== 订单2：pending_final（初审通过）======
  await req('POST', `/api/orders/${ids[1]}/first-review`, { result: 'pass', note: 'OK' }, first);
  const o2 = await req('GET', `/api/orders/${ids[1]}`, null, sales);
  console.log(`📌 订单2 [${o2.status}] 初审通过，客户 ${customers[1][1]}`);

  // ====== 订单3：repaying（完整链路到放款）======
  await req('POST', `/api/orders/${ids[2]}/first-review`, { result: 'pass', note: 'OK' }, first);
  await req('POST', `/api/orders/${ids[2]}/final-review`, { result: 'pass', note: 'OK' }, final);
  await req('POST', `/api/finance/${ids[2]}/approve`, { note: 'OK' }, fin);
  await req('POST', `/api/finance/${ids[2]}/payout`, { ref: 'GIABI20261126001', note: '放款' }, fin);
  const o3 = await req('GET', `/api/orders/${ids[2]}`, null, fin);
  console.log(`📌 订单3 [${o3.status}] 已放款，${o3.bills.length} 期账单`);
  // 手动还第 1 期
  const bill1 = o3.bills.find(b => b.status === 'pending');
  if (bill1) {
    await req('POST', `/api/bills/${bill1.id}/pay`, { channel: 'vietqr', txnNo: 'VQR20261126001', note: '测试还第1期' }, fin);
    const o3b = await req('GET', `/api/orders/${ids[2]}`, null, fin);
    const paid = o3b.bills.filter(b => b.status === 'paid').length;
    console.log(`   → 已还 ${paid}/${o3b.bills.length} 期`);
  }

  // ====== 订单4：pending_payout（finance approve 但没 payout）======
  await req('POST', `/api/orders/${ids[3]}/first-review`, { result: 'pass', note: 'OK' }, first);
  await req('POST', `/api/orders/${ids[3]}/final-review`, { result: 'pass', note: 'OK' }, final);
  await req('POST', `/api/finance/${ids[3]}/approve`, { note: 'OK' }, fin);
  const o4 = await req('GET', `/api/orders/${ids[3]}`, null, fin);
  console.log(`📌 订单4 [${o4.status}] finance approve 待 payout`);

  // ====== 汇总 ======
  const all = await req('GET', '/api/orders?size=100', null, sales);
  const m = {}; for (const o of all.items) m[o.status] = (m[o.status] || 0) + 1;
  console.log(`\n========== 测试数据最终状态 ==========`);
  console.log(`共 ${all.total} 条订单：`, m);
  console.log(`\n客户账单页（/order-web/customer）登录：`);
  console.log(`  手机号 0901234567  → 订单1 pending_first`);
  console.log(`  手机号 0912345678  → 订单2 pending_final`);
  console.log(`  手机号 0923456789  → 订单3 repaying（12期，已还1期）`);
  console.log(`  手机号 0934567890  → 订单4 ${o4.status}`);
  console.log(`  固定 OTP：123456`);
  console.log(`\n员工后台（/order-web/login）统一密码：Bycredit123!`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
