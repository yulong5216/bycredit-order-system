const paymentProvider = process.env.PAYMENT_PROVIDER || 'mock';
const esignProvider = process.env.ESIGN_PROVIDER || 'mock';
const isProduction = (process.env.NODE_ENV || 'development') === 'production';

if (isProduction && (paymentProvider === 'mock' || esignProvider === 'mock')) {
  throw new Error('生产环境禁止启用 mock 支付或 mock 签约，请切换真实 provider 或明确停用该能力');
}

const supported = {
  payment: ['mock', 'manual', 'disabled'],
  esign: ['mock', 'manual', 'disabled']
};

if (!supported.payment.includes(paymentProvider)) {
  throw new Error(`PAYMENT_PROVIDER=${paymentProvider} 尚未在第一阶段实现`);
}
if (!supported.esign.includes(esignProvider)) {
  throw new Error(`ESIGN_PROVIDER=${esignProvider} 尚未在第一阶段实现`);
}

module.exports = { paymentProvider, esignProvider };
