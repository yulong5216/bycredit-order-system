// 收款账号配置
// PayeeAccount = 收款银行账号列表 (多条可选)
// CollectionConfig = 某天选中哪个账号 (每天一条 active=true)
//
// 业务流程：
//   1. admin/finance 先把所有收款账号录入系统 (PayeeAccount.create)
//   2. 每天 admin/finance 点一下"今天用账号 X 收款" (switchToday)
//   3. 支付时 paymentService 自动读取 "今天的收款账号"

const { DomainError } = require('../domain/errors');

function payeeDto(p) {
  return {
    id: p.id,
    bank: p.bank,
    account: p.account,
    holder: p.holder,
    branch: p.branch,
    note: p.note,
    active: p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

function configDto(c) {
  return {
    id: c.id,
    date: c.date,
    active: c.active,
    remark: c.remark,
    createdAt: c.createdAt,
    payeeAccount: c.payeeAccount ? payeeDto(c.payeeAccount) : null,
    payeeAccountId: c.payeeAccountId
  };
}

function toDateKey(yyyyMMdd) {
  if (!yyyyMMdd) return null;
  const d = new Date(`${yyyyMMdd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new DomainError(400, 'VALIDATION_ERROR', '日期格式不对，要 YYYY-MM-DD');
  return d;
}

module.exports = function collectionRoutes(app) {
  const P = action => [app.authenticate, app.authorize(action)];
  const { prisma } = app;

  // ====== 收款账号列表/增删改 ======
  app.get('/api/collection/accounts', { preHandler: P('collection-config:view') }, async () => {
    const list = await prisma.payeeAccount.findMany({
      where: { active: true },
      orderBy: [{ createdAt: 'asc' }]
    });
    return { items: list.map(payeeDto), total: list.length };
  });

  app.post('/api/collection/accounts', { preHandler: P('collection-config:manage') }, async (req) => {
    const { bank, account, holder, branch = '', note = '' } = req.body || {};
    if (!bank || !account || !holder) throw new DomainError(400, 'VALIDATION_ERROR', '银行/账号/开户人都要填');
    const existing = await prisma.payeeAccount.findUnique({ where: { bank_account: { bank, account } } });
    if (existing) throw new DomainError(409, 'DUPLICATE', '同一银行+账号已存在');
    const p = await prisma.payeeAccount.create({ data: { bank, account, holder, branch, note } });
    return payeeDto(p);
  });

  app.put('/api/collection/accounts/:id', { preHandler: P('collection-config:manage') }, async (req) => {
    const id = req.params.id;
    const { bank, account, holder, branch = '', note = '' } = req.body || {};
    const p = await prisma.payeeAccount.findUnique({ where: { id } });
    if (!p) throw new DomainError(404, 'NOT_FOUND', '收款账号不存在');
    const updated = await prisma.payeeAccount.update({ where: { id }, data: { bank, account, holder, branch, note } });
    return payeeDto(updated);
  });

  app.delete('/api/collection/accounts/:id', { preHandler: P('collection-config:manage') }, async (req) => {
    const id = req.params.id;
    const p = await prisma.payeeAccount.findUnique({ where: { id } });
    if (!p) throw new DomainError(404, 'NOT_FOUND', '收款账号不存在');
    const updated = await prisma.payeeAccount.update({ where: { id }, data: { active: false } });
    return payeeDto(updated);
  });

  // ====== 切号 & 查当前 ======

  // 查"今天生效的收款账号"
  app.get('/api/collection/current', { preHandler: P('collection-config:view') }, async () => {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const cfg = await prisma.collectionConfig.findFirst({
      where: { date: today, active: true },
      include: { payeeAccount: true },
      orderBy: { createdAt: 'desc' }
    });
    if (!cfg) return { ok: false, message: '今天还没选收款账号，请先在后台切换一下' };
    return { ok: true, config: configDto(cfg) };
  });

  // 切号："今天用这个账号收款"
  app.post('/api/collection/switch', { preHandler: P('collection-config:switch') }, async (req) => {
    const { payeeAccountId, date, remark = '' } = req.body || {};
    if (!payeeAccountId) throw new DomainError(400, 'VALIDATION_ERROR', '请选一个收款账号');
    const targetDate = toDateKey(date) || new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const account = await prisma.payeeAccount.findUnique({ where: { id: payeeAccountId } });
    if (!account || !account.active) throw new DomainError(400, 'VALIDATION_ERROR', '选的收款账号不存在或已停用');
    // 先把这一天之前的 active 全部改成 false
    await prisma.collectionConfig.updateMany({ where: { date: targetDate, active: true }, data: { active: false } });
    // 插新的 active=true
    const cfg = await prisma.collectionConfig.create({
      data: { date: targetDate, payeeAccountId, active: true, remark },
      include: { payeeAccount: true }
    });
    return { ok: true, config: configDto(cfg), message: `已切换 ${targetDate.toISOString().slice(0,10)} 收款账号` };
  });

  // 历史切换列表 (最近 30 天)
  app.get('/api/collection/configs', { preHandler: P('collection-config:view') }, async () => {
    const { dateFrom, dateTo, size = 30 } = req.query || {};
    const where = {};
    if (dateFrom) where.date = { gte: toDateKey(dateFrom) };
    if (dateTo) where.date = { ...where.date, lte: toDateKey(dateTo) };
    if (!dateFrom && !dateTo) where.date = { gte: new Date(Date.now() - 30 * 86400000) };
    const list = await prisma.collectionConfig.findMany({
      where,
      include: { payeeAccount: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: Number(size) || 30
    });
    return { items: list.map(configDto) };
  });
};
