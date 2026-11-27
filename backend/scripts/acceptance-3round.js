// BY Credit · 三轮验收测试
// 第一轮: 冒烟（全角色登录 + 全接口 + 全链路）
// 第二轮: 节点审核拒绝返工流转测试
// 第三轮: 随机/边缘/负向（权限越界/空数据/重复/超长）
//
// 用法：先确认后端在 3001 端口跑着，然后:
//   cd backend && node scripts/acceptance-3round.js
//
// 种子账号密码统一 qwe123，由 prisma/seed.js 初始化。

const http = require('http');
const BASE = 'http://localhost:3001';
const PASS = '✅';
const FAIL = '❌';

let passCount = 0, failCount = 0;
function log() { console.log(...arguments); }
function assert(cond, ok, failMsg) {
  if (cond) { log(`  ${PASS} ${ok}`); passCount++; }
  else { log(`  ${FAIL} ${failMsg}`); failCount++; }
}

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const body = data !== undefined ? JSON.stringify(data) : '{}';
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
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

// ====== 造客户（phone/emergencyPhone 必须纯数字且不同）======
function makeCustomer(num = '001', idNum = '7891') {
  const numClean = String(num).replace(/\D/g, '').slice(-3);
  return {
    name: `测试客户${num}`, idType: 'CCCD',
    idNo: `0000000${String(idNum).slice(0,4).padStart(4,'0')}`,
    phone: `0999999${numClean.padStart(3,'0')}`,
    address: '123 Demo St', emergencyName: '紧急联系人', emergencyRelation: 'Vợ',
    emergencyPhone: `0988888${(parseInt(numClean) + 1).toString().padStart(3,'0').slice(-3)}`
  };
}
function makeOrderPayload(cust, storeId, price = 24000000, periods = 12) {
  return {
    submit: true,
    customer: cust,
    device: { model: 'iPhone 13', imei: '352046123456789', capacity: '128GB' },
    plan: { storeId, price, periods, rateBps: 0, firstDueDate: '2027-01-15' },
    payee: { bank: 'Vietcombank', account: '0071000999888', holder: 'CONG TY BY DN' }
  };
}
async function fullFlowFromDraft(orderId, roles) {
  await req('POST', `/api/orders/${orderId}/mdm/bind`, { serial: 'SERIAL' + orderId.slice(-6) }, roles.first);
  await req('POST', `/api/orders/${orderId}/esign/start`, {}, roles.first);
  await req('POST', `/api/orders/${orderId}/esign/simulate`, { ok: true, contractNo: 'MOCK-' + orderId }, roles.first);
  await req('POST', `/api/orders/${orderId}/first-review`, { result: 'pass', note: 'OK' }, roles.first);
  await req('POST', `/api/orders/${orderId}/final-review`, { result: 'pass', note: 'OK' }, roles.final);
  let o = await req('GET', `/api/orders/${orderId}`, {}, roles.finance);
  if (o.data.status === 'pending_finance') {
    await req('POST', `/api/finance/${orderId}/approve`, { note: 'OK' }, roles.finance);
    o = await req('GET', `/api/orders/${orderId}`, {}, roles.finance); // ← 刷新！
  }
  if (o.data.status === 'pending_payout') {
    await req('POST', `/api/finance/${orderId}/payout`, { ref: 'TEST' + orderId.slice(-6) }, roles.finance);
  }
  return (await req('GET', `/api/orders/${orderId}`, {}, roles.finance)).data;
}

// ============================================================
// 第 0 步：环境准备
// ============================================================
async function setup() {
  log('═══════════════════════════════════════════════');
  log('  BY Credit · 三轮验收测试');
  log('═══════════════════════════════════════════════');
  const h = await req('GET', '/api/health');
  assert(h.status === 200 && h.data.ok, '后端健康检查 OK', `health: ${h.status}`);

  const roles = ['admin', 'sales', 'sales2', 'first', 'final', 'finance', 'manager', 'aftercare', 'collector'];
  const T = {};
  for (const r of roles) {
    const res = await req('POST', '/api/auth/login', { username: r, password: 'qwe123' });
    assert(res.status === 200 && res.data.token, `${r} 登录成功`, `${r} 登录: ${res.status} ${res.data?.message}`);
    T[r] = res.data.token;
  }
  const stores = (await req('GET', '/api/stores?size=100', {}, T.admin)).data.items;
  const dnStore = stores.find(s => s.code === 'DN');
  assert(dnStore, '找到门店 DN', '门店列表里没有 DN');
  log(`\n  门店 DN id: ${dnStore.id}  name: ${dnStore.name}`);
  return { T, storeId: dnStore.id };
}

// ============================================================
// 第一轮: 冒烟 —— 全角色 + 全接口健康 + 全链路
// ============================================================
async function round1Smoke({ T, storeId }) {
  log('\n━━━━━━━━ 第一轮 · 冒烟测试 ━━━━━━━━');

  // 1.1 各角色 /api/auth/me
  for (const [role, token] of Object.entries(T)) {
    const r = await req('GET', '/api/auth/me', {}, token);
    assert(r.status === 200 && (r.data.user?.role || r.data.role), `${role} /me 正常（role=${r.data.user?.role || r.data.role}）`, `${role} me: ${r.status}`);
  }

  // 1.2 各角色能 listOrders（数据隔离）
  const orders = {};
  for (const role of ['admin', 'sales', 'first', 'final', 'finance', 'manager', 'collector', 'aftercare']) {
    const r = await req('GET', '/api/orders?size=5', {}, T[role]);
    assert(r.status === 200 && Array.isArray(r.data.items), `${role} listOrders OK（${r.data.items.length} 条）`, `${role} list: ${r.status} ${r.data?.message}`);
    orders[role] = r.data;
  }
  // admin 能看到最多，sales 只能看自己
  const adminTotal = orders.admin.total;
  const salesTotal = orders.sales.total;
  assert(adminTotal >= salesTotal, `admin 看到 ${adminTotal} >= sales 看到 ${salesTotal}（数据隔离）`, '数据隔离异常');

  // 1.3 新建订单 → 提交 → 自动 pending_first
  const payload1 = makeOrderPayload(makeCustomer('011', '1111'), storeId);
  const r1 = await req('POST', '/api/orders', payload1, T.sales);
  assert(r1.status === 201 && r1.data.status === 'pending_first', `sales 新建订单 → pending_first`, `创建: ${r1.status} ${r1.data?.message}`);
  const oId1 = r1.data.id;
  assert(r1.data.hasM0 === false && r1.data.overdueBucket === null, '新订单 hasM0=false overdueBucket=null', `hasM0=${r1.data.hasM0} bucket=${r1.data.overdueBucket}`);

  // 1.4 完整全链路 → repaying
  log(`\n  全链路跑（订单 ${oId1.slice(-8)}）...`);
  const roles = { first: T.first, final: T.final, finance: T.finance };
  let cur = await fullFlowFromDraft(oId1, roles);
  assert(cur.status === 'repaying', `最终状态 repaying`, `实际: ${cur.status}`);
  assert(Array.isArray(cur.bills) && cur.bills.length === 12, `自动生成 12 期账单`, `bills=${cur.bills?.length}`);

  // 1.5 逐期还款 → closed（channel 只能 bank_transfer / cash，必须传 paidAt）
  let paidCount = 0;
  for (let i = 1; i <= 12; i++) {
    const pay = await req('POST', `/api/orders/${oId1}/bills/${i}/pay`, {
      channel: i % 2 === 0 ? 'cash' : 'bank_transfer',
      txnNo: `SMOKE-PAY-${String(i).padStart(2,'0')}-${Date.now()}`,
      paidAt: new Date().toISOString(),
      note: `冒烟第 ${i} 期`
    }, T.finance);
    if (pay.status === 200) paidCount++;
    else log(`    warn: 第${i}期还款失败 ${pay.data?.message}`);
  }
  assert(paidCount === 12, `12 期全部还清（${paidCount}/12）`, `还有 ${12 - paidCount} 期未还`);
  const finalO = await req('GET', `/api/orders/${oId1}`, {}, T.finance);
  assert(finalO.data.status === 'closed', `最终 closed`, `实际: ${finalO.data.status}`);

  // 1.6 M0 催收接口
  log('\n  M0 催收联系接口...');
  const note = await req('POST', `/api/orders/${oId1}/contact-attempt`, { note: '冒烟测试催收备注' }, T.sales);
  assert(note.status === 200, `contact-attempt 200`, `contact: ${note.status} ${note.data?.message}`);

  // 1.7 改密码接口
  log('  改密码接口...');
  const pwd = await req('PUT', '/api/users/me/password', { oldPassword: 'qwe123', newPassword: 'qwe123' }, T.sales);
  assert(pwd.status === 200, `change password 200`, `pwd: ${pwd.status} ${pwd.data?.message}`);

  // 1.8 客户账单 OTP 登录（字段名是 code 不是 otp）
  log('  客户 OTP 登录...');
  const cust = await req('POST', '/api/auth/customer-login', { phone: '0999999011', code: '123456' });
  assert(cust.status === 200, `客户登录 200`, `cust: ${cust.status} ${cust.data?.message}`);
}

// ============================================================
// 第二轮: 节点审核拒绝返工 + 各种流转
// ============================================================
async function round2ReviewReflow({ T, storeId }) {
  log('\n━━━━━━━━ 第二轮 · 审核拒绝返工流转 ━━━━━━━━');

  // 场景 2.1: 初审驳回 → 修改资料 → 重新提交 → 初审通过
  log('\n  [场景 2.1] 初审驳回 → 修改 → 重新走通');
  const p21 = makeOrderPayload(makeCustomer('021', '2221'), storeId);
  const o21 = await req('POST', '/api/orders', p21, T.sales);
  assert(o21.status === 201, '2.1 创建订单', `创建: ${o21.status}`);
  const id21 = o21.data.id;

  // 驳回必须带 note
  const rej = await req('POST', `/api/orders/${id21}/first-review`, { result: 'reject' }, T.first);
  assert(rej.status === 400, '驳回无 note → 400', `未拦: ${rej.status}`);
  const rejOk = await req('POST', `/api/orders/${id21}/first-review`, { result: 'reject', note: '资料不齐' }, T.first);
  assert(rejOk.status === 200 && rejOk.data.status === 'rejected_first', `初审驳回成功`, `实际: ${rejOk.data?.status}`);

  // 修改资料（只能改 customer / device / payee — 初审驳回后仍允许）
  const upd = await req('PUT', `/api/orders/${id21}`, {
    customer: { name: '测试客户 021-改', phone: '0999999021', idNo: '000000002221', address: '新地址', emergencyName: '紧急联系人', emergencyRelation: 'Vợ', emergencyPhone: '0988888021' }
  }, T.sales);
  assert(upd.status === 200, `rejected_first 状态下能改 customer`, `改: ${upd.status}`);

  // 重新提交
  const submitBack = await req('POST', `/api/orders/${id21}/submit`, {}, T.sales);
  assert(submitBack.status === 200 && submitBack.data.status === 'pending_first', `重新提交 → pending_first`, `实际: ${submitBack.data?.status}`);

  // MDM + 签约 + 初审 + 终审 + 放款
  let cur21 = await fullFlowFromDraft(id21, { first: T.first, final: T.final, finance: T.finance });
  assert(cur21.status === 'repaying', `全部重走通 → repaying`, `实际: ${cur21.status}`);

  // 场景 2.2: 终审驳回 → 销售改 → 再走通
  log('\n  [场景 2.2] 终审驳回 → 重走');
  const p22 = makeOrderPayload(makeCustomer('022', '2222'), storeId);
  const o22 = await req('POST', '/api/orders', p22, T.sales);
  await fullFlowFromDraft(o22.data.id, { first: T.first, final: T.final, finance: T.finance }); // 先走完
  // 拿一个新的专门用于终审驳回的
  const p22b = makeOrderPayload(makeCustomer('223', '2223'), storeId);
  const o22b = await req('POST', '/api/orders', p22b, T.sales);
  const id22b = o22b.data.id;
  // MDM + 签约 + 初审通过 → 到 pending_final
  await req('POST', `/api/orders/${id22b}/mdm/bind`, { serial: 'SERIAL22B' }, T.first);
  await req('POST', `/api/orders/${id22b}/esign/start`, {}, T.first);
  await req('POST', `/api/orders/${id22b}/esign/simulate`, { ok: true, contractNo: 'MOCK-22B' }, T.first);
  await req('POST', `/api/orders/${id22b}/first-review`, { result: 'pass', note: 'OK' }, T.first);
  let cur22 = (await req('GET', `/api/orders/${id22b}`, {}, T.first)).data;
  assert(cur22.status === 'pending_final', `到达 pending_final`, `实际: ${cur22.status}`);
  // 终审驳回
  const rej2 = await req('POST', `/api/orders/${id22b}/final-review`, { result: 'reject', note: '合同照片有问题' }, T.final);
  assert(rej2.status === 200 && rej2.data.status === 'rejected_final', `终审驳回成功`, `实际: ${rej2.data?.status}`);
  // 销售重新提交
  await req('POST', `/api/orders/${id22b}/submit`, {}, T.sales);
  let cur22b = (await req('GET', `/api/orders/${id22b}`, {}, T.sales)).data;
  assert(cur22b.status === 'pending_first', `rejected_final → submit → pending_first`, `实际: ${cur22b.status}`);
  // 再次 MDM + 签约 + 初审 + 终审 + 放款
  cur22b = await fullFlowFromDraft(id22b, { first: T.first, final: T.final, finance: T.finance });
  assert(cur22b.status === 'repaying', `终审驳回重走 → repaying`, `实际: ${cur22b.status}`);

  // 场景 2.3: 审核通过后 → 不可编辑客户资料
  log('\n  [场景 2.3] 初审通过后禁止编辑客户资料');
  const p23 = makeOrderPayload(makeCustomer('023', '2224'), storeId);
  const o23 = await req('POST', '/api/orders', p23, T.sales);
  const id23 = o23.data.id;
  await req('POST', `/api/orders/${id23}/mdm/bind`, { serial: 'SERIAL23' }, T.first);
  await req('POST', `/api/orders/${id23}/esign/start`, {}, T.first);
  await req('POST', `/api/orders/${id23}/esign/simulate`, { ok: true, contractNo: 'MOCK-23' }, T.first);
  await req('POST', `/api/orders/${id23}/first-review`, { result: 'pass', note: 'OK' }, T.first);
  const blocked = await req('PUT', `/api/orders/${id23}`, { customer: { name: '我要改', phone: '0999999023', idNo: '000000002224', address: 'X', emergencyName: 'E', emergencyRelation: 'V', emergencyPhone: '0988888024' } }, T.sales);
  assert(blocked.status === 409, `初审通过后改客户资料 → 409 被拦`, `未拦: ${blocked.status} ${blocked.data?.message}`);

  // 场景 2.4: 取消订单
  log('\n  [场景 2.4] 取消订单');
  const p24 = makeOrderPayload(makeCustomer('024', '2225'), storeId);
  const o24 = await req('POST', '/api/orders', p24, T.sales);
  // 先不 submit，草稿状态直接取消
  const p24draft = makeOrderPayload(makeCustomer('240', '2226'), storeId);
  p24draft.submit = false;
  const o24draft = await req('POST', '/api/orders', p24draft, T.sales);
  const canDraftCancel = await req('POST', `/api/orders/${o24draft.data.id}/cancel`, { note: '不想做了' }, T.sales);
  assert(canDraftCancel.status === 200 && canDraftCancel.data.status === 'cancelled', `草稿取消成功`, `实际: ${canDraftCancel.data?.status}`);

  // 已放款的订单应该不能取消
  const cantCancelAfterPayout = await req('POST', `/api/orders/${id21}/cancel`, { note: '放款后取消' }, T.sales);
  assert(cantCancelAfterPayout.status === 409, `已放款取消 → 409`, `未拦: ${cantCancelAfterPayout.status}`);

  // 场景 2.5: finance  approve 之后 payout 之前能送财务（不允许重复）
  log('\n  [场景 2.5] finance approve 后 payout');
  const p25 = makeOrderPayload(makeCustomer('025', '2227'), storeId);
  const o25 = await req('POST', '/api/orders', p25, T.sales);
  await fullFlowFromDraft(o25.data.id, { first: T.first, final: T.final, finance: T.finance });
  const cur25 = (await req('GET', `/api/orders/${o25.data.id}`, {}, T.finance)).data;
  assert(cur25.status === 'repaying', `finance approve + payout → repaying`, `实际: ${cur25.status}`);
}

// ============================================================
// 第三轮: 随机/边缘/负向 —— 权限越界 / 空数据 / 重复 / 超长
// ============================================================
async function round3Negative({ T, storeId }) {
  log('\n━━━━━━━━ 第三轮 · 随机边缘负向 ━━━━━━━━');
  let failNeg = 0;

  // 3.1 无 token
  const noTok = await req('GET', '/api/orders?size=1', {}, null);
  assert(noTok.status === 401, '无 token → 401', `返回 ${noTok.status}`); failNeg += noTok.status === 401 ? 0 : 1;

  // 3.2 错误 token
  const badTok = await req('GET', '/api/orders?size=1', {}, 'this.is.not.a.real.token');
  assert(badTok.status === 401, '坏 token → 401', `返回 ${badTok.status}`); failNeg += badTok.status === 401 ? 0 : 1;

  // 3.3 sales 不能 first-review / final-review / payout
  const p3 = makeOrderPayload(makeCustomer('031', '3331'), storeId);
  const o3 = await req('POST', '/api/orders', p3, T.sales);
  const id3 = o3.data.id;
  const cantFirst = await req('POST', `/api/orders/${id3}/first-review`, { result: 'pass', note: '' }, T.sales);
  assert([403, 401].includes(cantFirst.status), `sales 不能初审（${cantFirst.status}）`, `没拦截: ${cantFirst.status}`);
  failNeg += [403, 401].includes(cantFirst.status) ? 0 : 1;

  // 3.4 sales2（另一个业务员）不能 contactAttempt sales 的订单
  const cantContact = await req('POST', `/api/orders/${id3}/contact-attempt`, { note: '我来催' }, T.sales2);
  assert([403, 401].includes(cantContact.status), `sales2 不能催 sales 的单`, `没拦: ${cantContact.status}`);
  failNeg += [403, 401].includes(cantContact.status) ? 0 : 1;

  // 3.5 contactAttempt note 必填
  const emptyNote = await req('POST', `/api/orders/${id3}/contact-attempt`, { note: '' }, T.sales);
  assert(emptyNote.status === 400, `空 note → 400`, `没拦: ${emptyNote.status}`);
  failNeg += emptyNote.status === 400 ? 0 : 1;

  // 3.6 改密码 oldPassword 错
  const wrongOld = await req('PUT', '/api/users/me/password', { oldPassword: 'wrong', newPassword: 'newpass123' }, T.sales);
  assert(wrongOld.status === 400, `oldPassword 错 → 400`, `没拦: ${wrongOld.status}`);
  failNeg += wrongOld.status === 400 ? 0 : 1;

  // 3.7 改密码 newPassword 太短
  const shortPwd = await req('PUT', '/api/users/me/password', { oldPassword: 'qwe123', newPassword: '1' }, T.sales);
  assert(shortPwd.status === 400, `短密码 → 400`, `没拦: ${shortPwd.status}`);
  failNeg += shortPwd.status === 400 ? 0 : 1;

  // 3.8 创建订单不带 payee
  const noPayee = await req('POST', '/api/orders', {
    submit: true,
    customer: makeCustomer('032', '3332'),
    device: { model: 'iPhone 13', imei: '352046123456789' },
    plan: { storeId, price: 24000000, periods: 12, rateBps: 0 }
  }, T.sales);
  assert(noPayee.status === 400, `缺 payee → 400`, `没拦: ${noPayee.status}`);
  failNeg += noPayee.status === 400 ? 0 : 1;

  // 3.9 审核通过后不能重新 submit
  await fullFlowFromDraft(id3, { first: T.first, final: T.final, finance: T.finance });
  const cantResubmit = await req('POST', `/api/orders/${id3}/submit`, {}, T.sales);
  assert(cantResubmit.status === 409, `repaying 状态 submit → 409`, `没拦: ${cantResubmit.status}`);
  failNeg += cantResubmit.status === 409 ? 0 : 1;

  // 3.10 重复初审通过
  await req('POST', `/api/orders/${id3}/mdm/bind`, { serial: 'SERIAL3A' }, T.first);
  const rejectOrder = await req('POST', `/api/orders/${id3}/first-review`, { result: 'reject', note: '测试驳回' }, T.first);
  // 等一下，已经 repaying 了，不能再驳回
  // 换一个：pending_final 时不能再 first-review
  const p3b = makeOrderPayload(makeCustomer('033', '3333'), storeId);
  const o3b = await req('POST', '/api/orders', p3b, T.sales);
  await req('POST', `/api/orders/${o3b.data.id}/mdm/bind`, { serial: 'SERIAL3B' }, T.first);
  await req('POST', `/api/orders/${o3b.data.id}/esign/start`, {}, T.first);
  await req('POST', `/api/orders/${o3b.data.id}/esign/simulate`, { ok: true, contractNo: 'MOCK-3B' }, T.first);
  await req('POST', `/api/orders/${o3b.data.id}/first-review`, { result: 'pass', note: 'OK' }, T.first);
  const cantFirstAgain = await req('POST', `/api/orders/${o3b.data.id}/first-review`, { result: 'pass', note: '再来一次' }, T.first);
  assert(cantFirstAgain.status === 409, `pending_final 再 first-review → 409`, `没拦: ${cantFirstAgain.status}`);
  failNeg += cantFirstAgain.status === 409 ? 0 : 1;

  // 3.11 customer phone 错误 + 错 OTP（字段名是 code）
  const badCust = await req('POST', '/api/auth/customer-login', { phone: '00000000000', code: '000000' });
  assert(badCust.status !== 200 || badCust.data?.token === undefined, `错客户 OTP/手机号 → 不通过`, `通过了: ${badCust.status}`);
  failNeg += badCust.status === 200 && badCust.data?.token ? 1 : 0;

  // 3.12 订单不存在
  const notFound = await req('GET', '/api/orders/doesnotexist12345', {}, T.admin);
  assert(notFound.status === 404, `查不存在订单 → 404`, `返回: ${notFound.status}`);
  failNeg += notFound.status === 404 ? 0 : 1;

  log(`\n  负向用例 ${failNeg} 项拦截失败`);
  passCount += 12 - failNeg; failCount += failNeg;

  // 3.13 listOrders 参数校验
  const hugeSize = await req('GET', '/api/orders?size=99999', {}, T.admin);
  assert(hugeSize.status === 200 && hugeSize.data.items.length <= 100, `size=99999 被 clamp 到 100`, `items=${hugeSize.data.items.length}`);

  log('\n  [M 分档边界测试]');
  // 造一个已经逾期的订单：dueDate = 昨天
  const p3m0 = makeOrderPayload(makeCustomer('340', '9990'), storeId);
  const o3m0 = await req('POST', '/api/orders', {
    ...p3m0,
    plan: { ...p3m0.plan, firstDueDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), periods: 3 }
  }, T.sales);
  await fullFlowFromDraft(o3m0.data.id, { first: T.first, final: T.final, finance: T.finance });
  const m0Order = (await req('GET', `/api/orders/${o3m0.data.id}`, {}, T.admin)).data;
  // 取第一期 bill 看 M 分档
  const b1 = m0Order.bills?.[0];
  log(`  订单 ${m0Order.orderNo} 第1期 due=${String(b1?.dueDate).slice(0,10)} status=${b1?.status} bucket=${m0Order.overdueBucket} hasM0=${m0Order.hasM0}`);
  if (b1?.status === 'Pending') {
    assert(['M0','M1','M2','M3'].includes(m0Order.overdueBucket), `有未还 bill 的订单有 overdueBucket=${m0Order.overdueBucket}`, `bucket=${m0Order.overdueBucket}`);
  }
}

// ============================================================
// 汇总
// ============================================================
async function main() {
  try {
    const { T, storeId } = await setup();
    await round1Smoke({ T, storeId });
    await round2ReviewReflow({ T, storeId });
    await round3Negative({ T, storeId });

    log('\n═══════════════════════════════════════════════');
    log(`  测试汇总  ✅ ${passCount} 通过   ❌ ${failCount} 失败`);
    log(`  通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
    log('═══════════════════════════════════════════════');
    process.exitCode = failCount > 0 ? 1 : 0;
  } catch (e) {
    log(`  脚本崩溃: ${e.message}`);
    process.exit(1);
  }
}
main();
