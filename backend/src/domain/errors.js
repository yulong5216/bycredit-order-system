class DomainError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assert(condition, statusCode, code, message) {
  if (!condition) throw new DomainError(statusCode, code, message);
}

module.exports = { DomainError, assert };
