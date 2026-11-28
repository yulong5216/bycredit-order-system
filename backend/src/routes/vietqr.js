// VietQR 回调端点
// POST /api/vietqr/callback/token → VietQR 来取 Bearer token
// POST /api/vietqr/callback/sync  → VietQR 推交易信息
//
// 完整流程:
//   VietQR 收到钱 → 调 /token → 拿 JWT → 调 /sync 带交易 → 我们销账
//   回调地址在 VietQR 后台配置，告诉他们完整 URL: https://byphone.cn/order-api/api/vietqr/callback/*

const { Prisma } = require('@prisma/client');
const { isPaid, repaymentStatus } = require('../utils/repayment');

// VietQR 回调的 Basic Auth 凭据（部署时用 .env 配置）
const CALLBACK_USERNAME = process.env.VIETQR_CALLBACK_USER || 'vietqr_sync';
const CALLBACK_PASSWORD = process.env.VIETQR_CALLBACK_PASS || 'vietqr_sync_pass_2026';
const SYNC_TOKEN_EXPIRES_SEC = 300;

function basicAuth(req) {
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    return { username: u, password: p };
  } catch { return null; }
}

function bearerToken(req) {
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

// 为 VietQR 回调端点生成和校验专用 token（aud=vietqr-sync）
// 复用 app.jwt 插件的 secret，加一个独立 aud 防止串用
function signSyncToken(app) {
  return app.jwt.sign({ aud: 'vietqr-sync', sub: 'vietqr' }, { expiresIn: SYNC_TOKEN_EXPIRES_SEC });
}
async function verifySyncToken(app, token) {
  const decoded = await app.jwt.verify(token);
  if (decoded.aud !== 'vietqr-sync') throw new Error('wrong aud');
  return decoded;
}

// VietQR 返回格式（必须严格按他们文档）
function vietqrResp(error = false, errorReason = null, refTxnId = null) {
  return {
    error,
    errorReason,
    toastMessage: error ? (errorReason || '处理失败') : 'OK',
    object: refTxnId ? { reftransactionid: refTxnId } : null
  };
}

module.exports = function vietqrRoutes(app) {
  app.post('/api/vietqr/callback/token', async (req, reply) => {
    // 1. Basic Auth
    const cred = basicAuth(req);
    if (!cred || cred.username !== CALLBACK_USERNAME || cred.password !== CALLBACK_PASSWORD) {
      reply.code(401);
      return { error: true, errorReason: 'INVALID_CREDENTIALS' };
    }
    // 2. 签一个 JWT（aud=vietqr-sync，5 分钟过期）
    const token = signSyncToken(app);
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: SYNC_TOKEN_EXPIRES_SEC
    };
  });

  app.post('/api/vietqr/callback/sync', async (req, reply) => {
    const { prisma } = app;
    // 1. Bearer token 校验
    const token = bearerToken(req);
    if (!token) { reply.code(401); return vietqrResp(true, 'INVALID_TOKEN'); }
    try {
      await verifySyncToken(app, token);
    } catch {
      reply.code(401); return vietqrResp(true, 'INVALID_TOKEN');
    }

    const body = req.body || {};
    const transType = body.transType;
    const amount = Number(body.amount || 0);
    const transactionId = String(body.transactionid || '').trim();
    const orderTag = String(body.orderId || body.content || '').trim();

    // 2. 只处理收入
    if (transType !== 'C') return vietqrResp(false, null, transactionId);

    if (!transactionId) return vietqrResp(true, 'MISSING_TRANSACTION_ID');
    if (!orderTag) return vietqrResp(true, 'MISSING_ORDER_TAG');

    app.log.info(`[VietQR sync] transId=${transactionId} orderTag=${orderTag} amount=${amount} bank=${body.bankaccount}`);

    try {
      const result = await prisma.$transaction(async tx => {
        // 幂等：这个 transactionId 之前有没有处理过
        const existingPay = await tx.paymentRequest.findFirst({ where: { externalTxnNo: transactionId } });
        if (existingPay && existingPay.status === 'succeeded') {
          app.log.info(`[VietQR] 幂等命中，已处理过 transactionId=${transactionId}`);
          return { skip: true };
        }

        // 3. 反查 orderTag → paymentRequest → bill
        // orderTag 可能是: "L2026...-P1" (我们 VietQR 里存的 orderNo-period)
        // 或者: VietQR 的短码 P001234501
        let bill = null;
        let order = null;
        let payment = existingPay;

        // 方式 A: 从 paymentRequest 里找（rawResponse 里有 qrCode 带 orderNo）
        if (orderTag.includes('-P')) {
          const orderNo = orderTag.replace(/-P\d+$/, '');
          const period = parseInt(orderTag.match(/-P(\d+)$/)?.[1] || '1', 10);
          order = await tx.order.findUnique({ where: { orderNo }, include: { bills: true } });
          if (order) bill = order.bills.find(b => b.period === period);
          if (!payment) payment = await tx.paymentRequest.findFirst({
            where: { orderId: order?.id, billId: bill?.id, provider: 'vietqr', status: 'pending' },
            orderBy: { createdAt: 'desc' }
          });
        }

        if (!bill) {
          // 方式 B: 从 content 短码反查
          payment = payment || await tx.paymentRequest.findFirst({
            where: { provider: 'vietqr', status: 'pending',
              rawResponse: { contains: orderTag }
            },
            orderBy: { createdAt: 'desc' }
          });
          if (payment) {
            bill = await tx.bill.findUnique({ where: { id: payment.billId } });
            if (bill && !order) order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { bills: true } });
          }
        }

        if (!bill || !order) {
          app.log.warn(`[VietQR] orderTag=${orderTag} 找不到对应账单`);
          return { notFound: true };
        }

        if (isPaid(bill)) {
          app.log.info(`[VietQR] bill ${bill.period} 已经 Paid，幂等跳过`);
          return { skip: true };
        }

        // 4. 金额校验（允许 ±1 盾的精度误差）
        const delta = Math.abs(Number(bill.amount) - amount);
        if (delta > 1) {
          app.log.warn(`[VietQR] 金额不符 bill=${bill.amount} received=${amount}`);
          return { amountMismatch: true };
        }

        // 5. 销账
        const paidAt = body.transactiontime ? new Date(Number(body.transactiontime)) : new Date();
        await tx.bill.update({
          where: { id: bill.id },
          data: {
            status: 'Paid',
            paidAt,
            txnNo: transactionId,
            channel: 'VietQR'
          }
        });
        if (payment) {
          await tx.paymentRequest.update({
            where: { id: payment.id },
            data: { status: 'succeeded', paidAt, externalTxnNo: transactionId }
          });
        }

        // 6. 账单全部还完 → 订单 closed
        const updatedOrder = await tx.order.findUnique({ where: { id: order.id }, include: { bills: true } });
        if (updatedOrder && repaymentStatus(updatedOrder.bills) === 'paid') {
          await tx.order.update({ where: { id: order.id }, data: { status: 'closed', closedAt: paidAt } });
        }

        // 7. 写日志
        await tx.auditLog.create({
          data: {
            orderId: order.id,
            actorId: null, actorName: 'VietQR 回调', actorRole: 'system',
            action: '客户扫码支付',
            before: `第 ${bill.period}期 ${bill.status}`,
            after: `Paid ${transactionId}`,
            note: `amount=${amount} bank=${body.bankaccount}`
          }
        });

        app.log.info(`[VietQR] ✅ 销账成功 order=${order.orderNo} bill=P${bill.period} txn=${transactionId}`);
        return { ok: true };
      });

      if (result.notFound) return vietqrResp(true, 'ORDER_NOT_FOUND', transactionId);
      if (result.amountMismatch) return vietqrResp(true, 'AMOUNT_MISMATCH', transactionId);
      return vietqrResp(false, null, transactionId);
    } catch (e) {
      app.log.error(`[VietQR sync] 服务器异常: ${e.message}`);
      reply.code(500);
      return vietqrResp(true, 'TRANSACTION_FAILED');
    }
  });
};
