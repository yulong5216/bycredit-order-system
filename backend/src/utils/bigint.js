function enableBigIntJson() {
  if (BigInt.prototype.toJSON) return;
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    configurable: true,
    writable: true,
    value() {
      const value = Number(this);
      if (!Number.isSafeInteger(value)) throw new Error('金额超出 JSON 安全整数范围');
      return value;
    }
  });
}

module.exports = { enableBigIntJson };
