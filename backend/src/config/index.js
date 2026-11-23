const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('生产环境必须配置 JWT_SECRET');
}

module.exports = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  publicBase: process.env.BYPHONE_PUBLIC_BASE || 'http://127.0.0.1:3001',
  jwt: {
    secret: process.env.JWT_SECRET || 'development-only-change-this-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  customerDemoOtp: process.env.CUSTOMER_DEMO_OTP || '123456',
  mockPaymentTtlMinutes: Number(process.env.MOCK_PAYMENT_TTL_MINUTES || 15),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads')),
  uploadMaxBytes: 10 * 1024 * 1024
};
