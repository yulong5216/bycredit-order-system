// 完整端到端冒烟测试：录单 → 初审 → 终审 → 财务审核 → 放款 → 12 期还款 → 结清
// 用法：先清空 DB + seed，然后 node scripts/smoke-e2e.js
const http = require('http');
const BASE = 'http://localhost:3001';

const PASS = '✅';
const FAIL = '❌';
const log = (...args) => console.log(...args);

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const body = data && Object.keys(data).length ? JSON.stringify(data) : '{}';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    headers['Content-Length'] = Buffer.byteLength(body);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers };
    const r = http.request(opts, res => {
      let c = '';
      res.on('data', d => c += d);
      res.on('end', () => {
        try { const j = JSON.parse(c); resolve({ status: res.statusCode, data: j }); }
        catch { resolve({ status: res.statusCode, raw: c }); }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function assert(cond, ok, fail) {
  if (cond) log(`  ${PASS} ${ok}`);
  else { log(`  ${FAIL} ${fail}`); process.exitCode = 1; }
}

async function main() {
  log('═══════════════════════════════════════════════');
  log(' BY Credit 完整端到端冒烟测试');
  log('═══════════════════════════════════════════════');

  // 登录所有角色
  log('\n[1] 登录所有角色...');
  const T = {};
  for (const [role, user] of [['admin','admin'],['sales','sales'],['first','first'],['final','final'],['fin','finance']]) {
    const r = await req('POST','/api/auth/login',{username:user,password:'Bycredit123!'});
    await assert(r.status===200 && r.data.token, `${role} 登录成功`, `${role} 登录失败: ${r.data?.message}`);
    T[role] = r.data.token;
  }

  // 拿门店
  const stores = (await req('GET','/api/stores?size=100',{},T.admin)).data.items;
  const storeId = stores.find(s=>s.code==='DN').id;
  log(`\n[2] 使用门店 DN: ${storeId}`);

  // ======== 步骤 1：sales 录单 ========
  log('\n[3] sales 录单 → submit → pending_first');
  const created = await req('POST','/api/orders',{
    submit: true,
    customer: {
      name: 'Nguyễn Văn An', idType: 'CCCD', idNo: '001234567891', phone: '0999999001',
      address: '123 Demo St', emergencyName: 'Nguyễn Thị Bích', emergencyRelation: 'Vợ', emergencyPhone: '0999999002'
    },
    device: { model: 'iPhone 13', imei: '352046123456789' },
    plan: { storeId, price: 24000000, periods: 12, rateBps: 0 },
    payee: { bank: 'Vietcombank', account: '0071000999888', holder: 'CONG TY BY DN' },
    notes: '冒烟测试'
  }, T.sales);
  await assert(created.status===201, '201 新建订单成功', `录单失败: ${created.data?.message}`);
  const oid = created.data.id;
  const ono = created.data.orderNo;
  await assert(created.data.status==='pending_first', `状态 pending_first（不是自动流转）`, `错误状态: ${created.data.status}`);
  log(`  📄 订单号: ${ono}  客户手机: 0999999001`);

  // ======== 步骤 2：first 发起签约 → simulate → MDM ========
  log('\n[4] first: MDM 绑定 + 演示签约');
  const mdm = await req('POST', `/api/orders/${oid}/mdm/bind`, { serial: 'SMOKESERIAL001' }, T.first);
  await assert(mdm.status===200 && mdm.data.mdm?.bound===true, `MDM 绑定成功`, `MDM 失败: ${mdm.data?.message} | mdm.bound=${mdm.data?.mdm?.bound}`);

  const esignStart = await req('POST', `/api/orders/${oid}/esign/start`, {}, T.first);
  await assert(esignStart.status===200 && esignStart.data.status==='pending_customer_sign',
    `签约发起成功（pending_customer_sign）`, `签约发起失败: ${esignStart.data?.message}`);

  const esignSim = await req('POST', `/api/orders/${oid}/esign/simulate`, { ok: true, contractNo: 'MOCK-' + ono }, T.first);
  await assert(esignSim.status===200 && esignSim.data.esign?.status==='succeeded',
    `签约模拟成功（succeeded）`, `签约模拟失败: ${esignSim.data?.message}`);

  // 签约成功后按你的要求保持 pending_first，不自动流转
  const afterEsign = await req('GET', `/api/orders/${oid}`, {}, T.first);
  await assert(afterEsign.data.status==='pending_first',
    `签约成功后仍为 pending_first（正确行为：等待人工初审）`,
    `错误流转: ${afterEsign.data.status}`);

  // ======== 步骤 3：first 初审通过 ========
  log('\n[5] first 初审通过 → pending_final');
  const firstReview = await req('POST', `/api/orders/${oid}/first-review`, { result: 'pass', note: '资料齐全通过' }, T.first);
  await assert(firstReview.status===200 && firstReview.data.status==='pending_final',
    `初审通过 → pending_final`, `初审失败: ${firstReview.data?.message} | 状态: ${firstReview.data.status}`);

  // ======== 步骤 4：final 终审通过 → pending_finance ========
  log('\n[6] final 终审通过 → pending_finance（系统自动送财务）');
  const finalReview = await req('POST', `/api/orders/${oid}/final-review`, { result: 'pass', note: '终审通过' }, T.final);
  await assert(finalReview.status===200, `终审调用 200`, `终审失败: ${finalReview.data?.message}`);
  const afterFinal = await req('GET', `/api/orders/${oid}`, {}, T.fin);
  await assert(['pending_finance','pending_payout'].includes(afterFinal.data.status),
    `终审后进入财务审核链路（${afterFinal.data.status}）`, `错误状态: ${afterFinal.data.status}`);

  // ======== 步骤 5：finance 审核 → 放款 ========
  log('\n[7] finance 审核 + 放款 → repaying + 生成账单');
  let cur = afterFinal.data;
  let payoutDone = false;

  // 如果还在 pending_finance，先 approve
  if (cur.status === 'pending_finance') {
    const finApprove = await req('POST', `/api/finance/${oid}/approve`, { note: 'finance OK' }, T.fin);
    await assert(finApprove.status===200, `finance approve 成功`, `approve 失败: ${finApprove.data?.message}`);
    cur = (await req('GET', `/api/orders/${oid}`, {}, T.fin)).data;
  }

  if (cur.status === 'pending_payout') {
    const payout = await req('POST', `/api/finance/${oid}/payout`, { ref: 'SMOKE20261126001', note: '冒烟测试放款' }, T.fin);
    await assert(payout.status===200 && payout.data.status==='repaying',
      `放款成功 → repaying`, `放款失败: ${payout.data?.message} | 状态: ${payout.data.status}`);
    cur = payout.data;
    payoutDone = true;
  } else {
    log(`  ⚠️ 跳过 payout，当前状态: ${cur.status}`);
  }

  await assert(cur.bills?.length===12, `自动生成 12 期账单（共 ${cur.bills?.length||0} 期）`,
    `账单数不对: ${cur.bills?.length}`);
  log(`  每期金额: ${(cur.bills[0].amount).toLocaleString('vi-VN')} VND`);

  // ======== 步骤 6：还 12 期直到结清 ========
  log('\n[8] 逐期还款 12 次 → closed');
  let bills = cur.bills || [];
  let paidCount = 0;
  const monthlyStart = Date.now();
  for (let i = 0; i < bills.length; i++) {
    const bill = bills.find(b => b.status === 'Pending');
    if (!bill) break;
    // 用不同支付渠道轮换一下，模拟真实场景
    const channels = ['bank_transfer','cash','bank_transfer','cash','bank_transfer','cash','bank_transfer','cash','bank_transfer','cash','bank_transfer','cash'];
    const channel = channels[i];
    const pay = await req('POST', `/api/orders/${oid}/bills/${i+1}/pay`, {
      channel,
      txnNo: `SMOKE-PAY-${String(i+1).padStart(2,'0')}`,
      paidAt: new Date().toISOString(),
      note: `冒烟测试还第 ${i+1} 期`
    }, T.fin);
    if (pay.status === 200) {
      paidCount++;
    } else {
      log(`  ⚠️ 第 ${i+1} 期还款失败: ${pay.data?.message}`);
    }
    // 刷新 bills
    cur = (await req('GET', `/api/orders/${oid}`, {}, T.fin)).data;
    bills = cur.bills || [];
  }
  const monthlyMs = Date.now() - monthlyStart;
  await assert(paidCount===12, `12 期全部还款成功（实际 ${paidCount} 期）`, `还有未还账单`);
  log(`  📦 总耗时: ${(monthlyMs/1000).toFixed(1)}s`);

  // ======== 最终断言 ========
  log('\n[9] 最终状态校验');
  await assert(cur.status==='closed',
    `订单终态 closed（已结清）`, `最终状态: ${cur.status}`);
  const paidBills = cur.bills.filter(b => b.status==='Paid').length;
  await assert(paidBills===12, `12/12 期账单 Paid`, `paid=${paidBills}/12`);
  await assert(cur.payout?.status==='paid', `放款状态 paid`, `payout=${JSON.stringify(cur.payout)}`);

  // 审计日志（直接在 order 对象里，是数组）
  const logs = cur.logs || [];
  await assert(logs.length >= 10, `审计日志 ${logs.length} 条（>=10）`, `日志太少: ${logs.length}`);
  log(`  📝 审计日志前 3 条:`);
  for (const l of logs.slice(0,3)) log(`     · ${l.action} | ${l.actorName} | 订单状态 ${l.after?.orderStatus ?? l.after}`);

  // 客户账单页能查
  log('\n[10] 客户账单页（手机号 0999999001）');
  const custLogin = await req('POST', '/api/auth/customer-login', { phone: '0999999001', otp: '123456' });
  await assert(custLogin.status===200, `客户 OTP 登录成功`, `客户登录失败: ${custLogin.data?.message}`);

  // ======== 汇总 ========
  log('\n═══════════════════════════════════════════════');
  log(`  冒烟测试完成！`);
  log(`  订单号: ${ono}`);
  log(`  最终状态: ${cur.status}（已结清）`);
  log(`  账单: 12/12 paid`);
  log(`  审计日志: ${logs.data.total} 条`);
  log(`  总耗时: ~${((Date.now()-monthlyStart)/1000).toFixed(1)}s`);
  log('═══════════════════════════════════════════════');

  // 如果任何步骤失败了 process.exitCode 已经被设为 1
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
