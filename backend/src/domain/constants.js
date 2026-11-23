const ORDER_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_FIRST: 'pending_first',
  REJECTED_FIRST: 'rejected_first',
  PENDING_SIGN: 'pending_customer_sign',
  PENDING_FINAL: 'pending_final',
  REJECTED_FINAL: 'rejected_final',
  APPROVED_FINAL: 'approved_final',
  PENDING_FINANCE: 'pending_finance',
  PENDING_PAYOUT: 'pending_payout',
  REPAYING: 'repaying',
  OVERDUE: 'overdue',
  BREACH: 'breach',
  CLOSED: 'closed',
  CANCELLED: 'cancelled'
});

const BILL_STATUS = Object.freeze({
  PENDING: 'Pending',
  PAID: 'Paid',
  DEFERRED: 'Deferred',
  OVERDUE: 'Overdue',
  BREACH: 'Breach',
  SETTLED: 'Settled'
});

const ROLES = Object.freeze(['admin', 'sales', 'first', 'final', 'finance', 'manager', 'aftercare', 'collector']);

const PERMISSIONS = Object.freeze({
  'order:create': ['sales'],
  'order:view': ['sales', 'manager', 'first', 'final', 'finance', 'aftercare', 'collector'],
  'order:update': ['sales', 'manager', 'first'],
  'order:submit': ['sales'],
  'order:first-review': ['first'],
  'order:final-review': ['final'],
  'order:send-finance': ['final'],
  'order:cancel': [],
  'order:plan': ['first'],
  'order:note': ['sales', 'manager', 'first', 'final', 'finance', 'aftercare', 'collector'],
  'esign:start': ['first'],
  'esign:result': ['first'],
  'mdm:bind': ['first'],
  'finance:review': ['finance'],
  'finance:payout': ['finance'],
  'finance:export': ['finance'],
  'bill:manual-pay': ['finance'],
  'payment:create': ['finance'],
  'payment:view': ['finance'],
  'bill:defer': ['finance'],
  'bill:breach': ['finance'],
  'store:view': ['sales', 'manager', 'first', 'final', 'finance', 'aftercare', 'collector'],
  'store:create': [],
  'store:update': ['manager'],
  'store:rating': [],
  'store:status': []
});

const REQUIRED_DOCS = Object.freeze([
  'id_front', 'id_back', 'selfie', 'work_proof', 'bank_statement',
  'staff_customer_photo', 'phone_verify', 'imei_photo', 'address_photo'
]);

const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.REPAYING,
  ORDER_STATUS.OVERDUE,
  ORDER_STATUS.BREACH,
  ORDER_STATUS.CLOSED
];

const PRE_FIRST_REVIEW_STATUSES = [
  ORDER_STATUS.PENDING_FIRST,
  ORDER_STATUS.REJECTED_FIRST,
  ORDER_STATUS.PENDING_SIGN
];

function can(role, action) {
  return role === 'admin' || (ROLES.includes(role) && (PERMISSIONS[action] || []).includes(role));
}

module.exports = {
  ORDER_STATUS,
  BILL_STATUS,
  ROLES,
  PERMISSIONS,
  REQUIRED_DOCS,
  ACTIVE_ORDER_STATUSES,
  PRE_FIRST_REVIEW_STATUSES,
  can
};
