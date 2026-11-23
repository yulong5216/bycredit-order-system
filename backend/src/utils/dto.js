function latestEsign(order) {
  const latest = order.esignAttempts && order.esignAttempts[0];
  return {
    status: latest ? latest.status : 'not_started',
    provider: latest ? latest.provider : null,
    contractNo: latest ? latest.externalContractNo : null,
    attempt: latest ? latest.attempt : 0,
    signedAt: latest && latest.status === 'succeeded' ? latest.completedAt : null,
    failReason: latest ? latest.failureReason : '',
    isMock: latest ? latest.isMock : false
  };
}

function toOrderDto(order, customerHistory = []) {
  if (!order) return null;
  const payments = order.payments || [];
  const bills = (order.bills || []).map(bill => {
    const succeeded = payments.filter(payment => payment.billId === bill.id && payment.status === 'succeeded');
    return {
      ...bill,
      realPaidAmount: succeeded.filter(payment => !payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n),
      mockPaidAmount: succeeded.filter(payment => payment.isMock).reduce((sum, payment) => sum + payment.amount, 0n)
    };
  });
  return {
    ...order,
    bills,
    plan: {
      storeId: order.storeId,
      storeName: order.store ? order.store.name : '',
      salesId: order.salesId,
      salesName: order.salesName,
      price: order.price,
      downPayment: order.downPayment,
      principal: order.principal,
      periods: order.periods,
      rateBps: order.rateBps,
      perPeriod: order.perPeriod,
      firstDueDate: order.firstDueDate
    },
    esign: latestEsign(order),
    payout: {
      status: order.payoutAt ? 'paid' : 'pending',
      at: order.payoutAt,
      ref: order.payoutRef,
      by: order.payoutBy
    },
    customerHistory
  };
}

module.exports = { toOrderDto, latestEsign };
