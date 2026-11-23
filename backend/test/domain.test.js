const test = require('node:test');
const assert = require('node:assert/strict');
const { addMonths, buildBillRows, dateOnly } = require('../src/utils/schedule');
const { normalizePlan, normalizeCustomer } = require('../src/utils/validation');
const { can, PERMISSIONS, ROLES } = require('../src/domain/constants');
const { csvCell, HEADERS } = require('../src/services/exportService');
const { listOrders, assertOrderAccess, createOrder, updateOrder } = require('../src/services/orderService');

test('月末日期按自然月且不超过目标月末', () => {
  assert.equal(dateOnly(addMonths('2026-01-31', 1)), '2026-02-28');
  assert.equal(dateOnly(addMonths('2024-01-31', 1)), '2024-02-29');
  assert.equal(dateOnly(addMonths('2026-11-30', 3)), '2027-02-28');
});

test('账单末期吸收尾差且金额总和等于还款总额', () => {
  const rows = buildBillRows({ total: 10000000n, periods: 3, perPeriod: 3333333n, firstDueDate: '2026-12-15' });
  assert.deepEqual(rows.map(row => row.amount), [3333333n, 3333333n, 3333334n]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0n), 10000000n);
  assert.deepEqual(rows.map(row => dateOnly(row.dueDate)), ['2026-12-15', '2027-01-15', '2027-02-15']);
});

test('放款金额按每期利率计算每期还款额，首付固定为 0', () => {
  const plan = normalizePlan({ price: 8300000, periods: 3, rateBps: 650, firstDueDate: '2026-12-15' });
  assert.equal(plan.downPayment, 0n);
  assert.equal(plan.principal, 8300000n);
  assert.equal(plan.perPeriod, 3306167n);
  assert.equal(plan.rateBps, 650);

  const fromPerPeriod = normalizePlan({ price: 8300000, periods: 3, perPeriod: 3306167, firstDueDate: '2026-12-15' });
  assert.equal(fromPerPeriod.rateBps, 650);
  assert.equal(fromPerPeriod.perPeriod, 3306167n);

  assert.throws(() => normalizePlan({ price: 100, periods: 2, perPeriod: 10, firstDueDate: '2026-12-15' }), /不能低于/);
});

test('客户紧急联系人不能与本人手机号相同', () => {
  const customer = { name: 'Nguyen A', idNo: '001234567890', phone: '0901234567', address: 'Da Nang', emergencyName: 'Nguyen B', emergencyRelation: 'Anh', emergencyPhone: '0901234567' };
  assert.throws(() => normalizeCustomer(customer), /紧急联系人不能/);
});

test('8 角色权限采用英文动作且管理员显式放行', () => {
  assert.equal(ROLES.length, 8);
  assert.equal(can('sales', 'order:create'), true);
  assert.equal(can('sales', 'order:final-review'), false);
  assert.equal(can('first', 'mdm:bind'), true);
  assert.equal(can('finance', 'bill:manual-pay'), true);
  assert.equal(can('aftercare', 'bill:manual-pay'), false);
  assert.equal(can('admin', 'store:status'), true);
  assert.equal(Object.keys(PERMISSIONS).some(key => /[\u4e00-\u9fff]/.test(key)), false);
});

test('财务表头为 17 列并防止 CSV 公式注入', () => {
  assert.equal(HEADERS.length, 17);
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('a,b'), '"a,b"');
});

test('店长和催收的列表筛选不能覆盖数据范围', async () => {
  const queries = [];
  const prisma = {
    order: {
      async findMany(args) { queries.push(args.where); return []; },
      async count() { return 0; }
    },
    $transaction(work) { return Promise.all(work.map(item => item)); }
  };
  await listOrders(prisma, { role: 'manager', sub: 'manager-1', storeId: 'own-store' }, { store: 'other-store' });
  await listOrders(prisma, { role: 'collector', sub: 'collector-1' }, { status: 'repaying' });
  assert.equal(queries[0].storeId, 'own-store');
  assert.deepEqual(queries[1].status.in, ['overdue', 'breach']);
});

test('客户和销售详情访问严格校验归属', () => {
  const order = { customer: { phone: '0901234567' }, salesId: 'sales-1', storeId: 'store-1', status: 'repaying' };
  assert.equal(assertOrderAccess(order, { role: 'admin' }), undefined);
  assert.throws(() => assertOrderAccess(order, { role: 'sales', sub: 'sales-2' }), /自己录入/);
  assert.throws(() => assertOrderAccess(order, { type: 'customer', role: 'customer', phone: '0900000000' }), /当前手机号/);
  assert.throws(() => assertOrderAccess(order, { role: 'collector', sub: 'collector-1' }), /逾期或坏账/);
});

test('创建和通用更新接口均拒绝伪造影像元数据', async () => {
  const docs = { id_front: { name: 'fake.png', storageName: 'fake.png' } };
  await assert.rejects(createOrder(null, { role: 'sales' }, { docs }), /专用上传接口/);
  await assert.rejects(updateOrder(null, { role: 'sales' }, 'order-1', { docs }), /专用上传接口/);
});
