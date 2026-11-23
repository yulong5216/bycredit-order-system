function asDateOnly(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('无效日期');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateOnly(value) {
  return asDateOnly(value).toISOString().slice(0, 10);
}

function addMonths(value, count) {
  const date = asDateOnly(value);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function buildBillRows({ total, periods, perPeriod, firstDueDate }) {
  let allocated = 0n;
  return Array.from({ length: periods }, (_, index) => {
    const isLast = index === periods - 1;
    const amount = isLast ? total - allocated : perPeriod;
    allocated += amount;
    return {
      period: index + 1,
      dueDate: addMonths(firstDueDate, index),
      amount,
      paidAmount: 0n,
      status: 'Pending'
    };
  });
}

module.exports = { asDateOnly, dateOnly, addMonths, buildBillRows };
