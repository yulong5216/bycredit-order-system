// M 分档规则（按你说的）：
// M0: 超过还款日 ≤ 3 天  → 业务员待办（要联系）
// M1: 4 ~ 7 天            → 贷后管理
// M2: 8 ~ 30 天           → 贷后管理
// M3: > 30 天             → 贷后管理

function daysBetween(from, to = new Date()) {
  const a = new Date(from).setHours(0, 0, 0, 0);
  const b = new Date(to).setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

// 给某一期账单算分档
function bucketForBill(bill, now = new Date()) {
  if (!bill || bill.status === 'paid') return null;
  if (!bill.dueDate) return null;
  const overdueDays = daysBetween(bill.dueDate, now);
  if (overdueDays === 0) return null;   // 当天不算逾期
  if (overdueDays <= 3) return 'M0';
  if (overdueDays <= 7) return 'M1';
  if (overdueDays <= 30) return 'M2';
  return 'M3';
}

// 给整个订单算最严重的分档（取最严重的那一期）
function bucketForOrder(order, now = new Date()) {
  const bills = order.bills || [];
  const worstOrder = { M0: 1, M1: 2, M2: 3, M3: 4 };
  let worst = null;
  let worstScore = 0;
  for (const bill of bills) {
    const b = bucketForBill(bill, now);
    if (b && worstOrder[b] > worstScore) {
      worst = b;
      worstScore = worstOrder[b];
    }
  }
  return worst;
}

// 订单里是否存在 M0 逾期（业务员待办）
function hasM0(order, now = new Date()) {
  const bills = order.bills || [];
  return bills.some(b => bucketForBill(b, now) === 'M0');
}

module.exports = { bucketForBill, bucketForOrder, hasM0, daysBetween };
