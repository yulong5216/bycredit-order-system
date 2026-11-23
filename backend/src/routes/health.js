const config = require('../config');
const integration = require('../config/integration');

module.exports = async function healthRoutes(app) {
  app.get('/api/health', async () => ({
    ok: true,
    service: 'bycredit-order-backend',
    environment: config.nodeEnv,
    providers: integration,
    demo: {
      payment: integration.paymentProvider === 'mock',
      esign: integration.esignProvider === 'mock'
    }
  }));
};
