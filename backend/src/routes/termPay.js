// 兼容 byphone 小程序 "我的" 页面的分期账单查询
// 前端 Mine.vue 调 POST /term_pay 传 { phone }，返回老格式：
//   [{ expact: "1", amount: 2000000, qr_url: "data:image/png;base64,...", paid: false, pay_date: 1733558400, order_no: "L..." }]
// 端点不走 /api 前缀也能匹配（兼容老代理），生产实际走 /api/term_pay

const vietqrProvider = require('../providers/vietqrProvider');

module.exports = async function termPayRoutes(app) {

  // 新 bycredit 系统的真实数据查询
  app.post('/api/term_pay', async (req, reply) => {
    const { phone } = req.body || {};
    if (!phone) return reply.send({ code: -1, message: 'phone required' });
    const { prisma } = app;

    try {
      // 1. 从 Order 反查（Order → customer.phone）
      const orders = await prisma.order.findMany({
        where: {
          status: { not: 'cancelled' },
          customer: { phone: { contains: String(phone).trim() } }
        },
        include: {
          customer: true,
          bills: { orderBy: { period: 'asc' } }
        }
      });

      const allOrders = orders;

      // 1b. 补充匹配 emergencyPhone / workPhone
      let moreOrders = [];
      if (orders.length === 0) {
        moreOrders = await prisma.order.findMany({
          where: {
            status: { not: 'cancelled' },
            customer: {
              OR: [
                { emergencyPhone: { contains: String(phone).trim() } },
                { workPhone: { contains: String(phone).trim() } }
              ]
            }
          },
          include: { customer: true, bills: { orderBy: { period: 'asc' } } }
        });
      }

      const merged = orders.concat(moreOrders);

      // 4. 整理成老格式
      const results = [];
      for (const order of merged) {
        for (const bill of (order.bills || [])) {
          // 到期日转 Unix 秒（老接口约定）
          const payDateUnix = bill.dueDate ? Math.floor(new Date(bill.dueDate).getTime() / 1000) : 0;

          // 生成 VietQR（未还的才生成，已还的返回空字符串）
          let qrUrl = '';
          const isPaid = bill.status === 'Paid';
          if (!isPaid) {
            try {
              // 取订单的收款账号（新系统已经在 order.payee 里了）
              const payee = order.payee || { bank: 'Vietcombank', account: '0071000999888', holder: 'CONG TY BY DN' };
              const qr = await vietqrProvider.buildFull({
                account: payee.account,
                amount: Number(bill.amount),
                orderNo: `${order.orderNo}-P${bill.period}`,
                bank: payee.bank || '',
                holder: payee.holder || 'BY CREDIT',
                dynamic: false
              });
              qrUrl = qr.dataUrl || '';
            } catch (e) {
              app.log.warn(`[term_pay] VietQR 生成失败: ${e.message}`);
              qrUrl = '';
            }
          }

          results.push({
            expact: String(bill.period),
            amount: Number(bill.amount),
            qr_url: qrUrl,
            paid: isPaid,
            pay_date: payDateUnix,
            order_no: order.orderNo,
            order_id: order.id,
            period: bill.period,
            bill_id: bill.id,
            status: bill.status,
            paid_at: bill.paidAt ? Math.floor(new Date(bill.paidAt).getTime() / 1000) : null,
            payee: order.payee || null
          });
        }
      }

      return reply.send({
        code: 0,
        data: results,
        total: results.length
      });
    } catch (e) {
      app.log.error(`[term_pay] 查询失败: ${e.message}`);
      return reply.send({ code: -1, message: e.message });
    }
  });
};
