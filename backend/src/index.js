const cron = require('node-cron');
const { buildApp, config } = require('./app');
const { markOverdue } = require('./services/billService');

async function start() {
  const app = await buildApp();
  const job = cron.schedule('5 0 * * *', async () => {
    try {
      const count = await markOverdue(app.prisma);
      app.log.info(`逾期定时任务完成，更新 ${count} 期账单`);
    } catch (error) {
      app.log.error(error, '逾期定时任务失败');
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  app.addHook('onClose', async () => job.stop());
  await app.listen({ port: config.port, host: config.host });
  await markOverdue(app.prisma);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
