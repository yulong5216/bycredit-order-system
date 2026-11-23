const { ORDER_STATUS, BILL_STATUS } = require('../domain/constants');

function isPaid(bill) {
  return [BILL_STATUS.PAID, BILL_STATUS.SETTLED].includes(bill.status);
}

function repaymentStatus(bills) {
  if (bills.length > 0 && bills.every(isPaid)) return ORDER_STATUS.CLOSED;
  if (bills.some(bill => bill.status === BILL_STATUS.BREACH)) return ORDER_STATUS.BREACH;
  if (bills.some(bill => bill.status === BILL_STATUS.OVERDUE)) return ORDER_STATUS.OVERDUE;
  return ORDER_STATUS.REPAYING;
}

module.exports = { isPaid, repaymentStatus };
