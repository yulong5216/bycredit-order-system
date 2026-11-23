const { assert } = require('../domain/errors');
const { asDateOnly, buildBillRows } = require('./schedule');

function text(value, label, required = true) {
  const result = String(value ?? '').trim();
  if (required) assert(result, 400, 'VALIDATION_ERROR', `${label}不能为空`);
  return result;
}

function phone(value, label = '手机号') {
  const result = text(value, label).replace(/\s/g, '');
  assert(/^\d{1,11}$/.test(result), 400, 'VALIDATION_ERROR', `${label}只能填写数字，且不超过 11 位`);
  return result;
}

function money(value, label, { allowZero = false } = {}) {
  const raw = String(value ?? '').trim();
  assert(/^\d+$/.test(raw), 400, 'VALIDATION_ERROR', `${label}必须为整数越南盾`);
  const result = BigInt(raw);
  assert(result <= BigInt(Number.MAX_SAFE_INTEGER), 400, 'VALIDATION_ERROR', `${label}超出支持范围`);
  assert(allowZero ? result >= 0n : result > 0n, 400, 'VALIDATION_ERROR', `${label}必须${allowZero ? '大于等于' : '大于'} 0`);
  return result;
}

function normalizePlan(input = {}) {
  const principal = money(input.price ?? input.principal, '放款金额');
  const periods = Number(input.periods);
  assert(Number.isInteger(periods) && periods >= 1 && periods <= 36, 400, 'VALIDATION_ERROR', '期数须为 1-36 的整数');
  const divisor = BigInt(periods);
  const base = (principal + divisor / 2n) / divisor;

  let rateBps;
  if (input.rateBps !== undefined && input.rateBps !== '' && input.rateBps !== null) {
    rateBps = Number(input.rateBps);
    assert(Number.isInteger(rateBps) && rateBps >= 0 && rateBps <= 10000, 400, 'VALIDATION_ERROR', '每期利率须为 0-10000 的整数基点');
  }

  let perPeriod;
  if (rateBps === undefined) {
    if (input.perPeriod !== undefined && input.perPeriod !== '' && input.perPeriod !== null) {
      perPeriod = money(input.perPeriod, '每期金额');
      const profit = perPeriod - base;
      assert(profit >= 0n, 400, 'VALIDATION_ERROR', '每期金额不能低于本金分摊金额');
      rateBps = Number((profit * 10000n + principal / 2n) / principal);
      assert(rateBps <= 10000, 400, 'VALIDATION_ERROR', '每期利率过高，请核对每期金额');
    } else {
      rateBps = 0;
      perPeriod = base;
    }
  } else {
    perPeriod = base + (principal * BigInt(rateBps) + 5000n) / 10000n;
  }

  const total = perPeriod * divisor;
  const firstDueDate = asDateOnly(input.firstDueDate);
  const rows = buildBillRows({ total, periods, perPeriod, firstDueDate });
  assert(rows.every(row => row.amount > 0n), 400, 'VALIDATION_ERROR', '每期金额与期数不匹配，末期金额必须大于 0');
  return { price: principal, downPayment: 0n, principal, periods, perPeriod, rateBps, firstDueDate };
}

function normalizeCustomer(input = {}) {
  const customer = {
    name: text(input.name, '客户姓名'),
    idType: text(input.idType || 'CCCD', '证件类型'),
    idNo: text(input.idNo, '证件号码').replace(/\s/g, ''),
    phone: phone(input.phone),
    birthDate: text(input.birthDate, '出生日期', false),
    gender: text(input.gender, '性别', false),
    address: text(input.address, '常住地址'),
    currentAddress: text(input.currentAddress, '现住地址', false),
    workCompany: text(input.workCompany, '工作单位', false),
    workPhone: text(input.workPhone, '工作电话', false),
    emergencyName: text(input.emergencyName, '紧急联系人'),
    emergencyRelation: text(input.emergencyRelation, '与客户关系'),
    emergencyPhone: phone(input.emergencyPhone, '紧急联系人电话'),
    secondName: text(input.secondName, '第二联系人', false),
    secondPhone: text(input.secondPhone, '第二联系人电话', false)
  };
  assert(/^\d{1,12}$/.test(customer.idNo) || /护照|passport/i.test(customer.idType), 400, 'VALIDATION_ERROR', '证件号码只能填写数字，且不超过 12 位');
  assert(customer.phone !== customer.emergencyPhone, 400, 'VALIDATION_ERROR', '紧急联系人不能与客户本人号码相同');
  return customer;
}

function normalizeDevice(input = {}) {
  const device = {
    model: text(input.model, '机型'),
    capacity: text(input.capacity, '容量', false),
    color: text(input.color, '颜色', false),
    imei: text(input.imei, 'IMEI').replace(/[^0-9]/g, ''),
    score: text(input.score, '验机评分', false),
    checks: input.checks && typeof input.checks === 'object' ? input.checks : {}
  };
  assert(device.imei.length >= 10 && device.imei.length <= 15, 400, 'VALIDATION_ERROR', 'IMEI 位数不正确');
  return device;
}

module.exports = { text, phone, money, normalizePlan, normalizeCustomer, normalizeDevice };
