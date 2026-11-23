const bcrypt = require('bcrypt');
const { text } = require('../utils/validation');
const { DomainError } = require('../domain/errors');

module.exports = async function userRoutes(app) {
  // 只有 admin 能管理员工
  const requireAdmin = [app.authenticate, (request, reply, done) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ code: 'FORBIDDEN', message: '仅管理员可管理员工' });
    done();
  }];

  // 列表（admin 看全部，其他看自己）
  app.get('/api/users', { preHandler: [app.authenticate] }, async request => {
    const actor = request.user;
    const where = {};
    if (actor.role !== 'admin') where.id = actor.sub;
    const { teamId, storeId, role, active, q } = request.query;
    if (actor.role === 'admin') {
      if (teamId) where.teamId = teamId;
      if (storeId) where.storeId = storeId;
      if (role) where.role = role;
      if (active !== undefined && active !== '') where.active = active === 'true';
      if (q) where.OR = [{ name: { contains: q } }, { username: { contains: q } }];
    }
    const [items, total] = await app.prisma.$transaction([
      app.prisma.user.findMany({ where, include: { team: true, store: true }, orderBy: { createdAt: 'desc' }, skip: (Number(request.query.page) || 1 - 1) * (Number(request.query.size) || 20), take: Number(request.query.size) || 20 }),
      app.prisma.user.count({ where })
    ]);
    return { items: items.map(u => ({
      id: u.id, username: u.username, name: u.name, role: u.role, active: u.active,
      teamId: u.teamId, teamName: u.team?.name || null,
      storeId: u.storeId, storeName: u.store?.name || null,
      createdAt: u.createdAt
    })), total };
  });

  // 创建员工
  app.post('/api/users', { preHandler: requireAdmin }, async request => {
    const { username, name, role, teamId, storeId, password, active = true } = request.body;
    assertUnique = await app.prisma.user.findUnique({ where: { username } });
    if (assertUnique) throw new DomainError(409, 'USERNAME_EXISTS', '账号已存在');
    const hash = await bcrypt.hash(password || 'Default123!', 12);
    const user = await app.prisma.user.create({
      data: { username, passwordHash: hash, name, role, teamId: teamId || null, storeId: storeId || null, active: active !== false },
      include: { team: true, store: true }
    });
    return { id: user.id, username: user.username, name: user.name, role: user.role, teamName: user.team?.name, storeName: user.store?.name };
  });

  // 修改员工
  app.patch('/api/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const u = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!u) throw new DomainError(404, 'NOT_FOUND', '员工不存在');
    const data = {};
    if (request.body.name !== undefined) data.name = request.body.name;
    if (request.body.teamId !== undefined) data.teamId = request.body.teamId || null;
    if (request.body.storeId !== undefined) data.storeId = request.body.storeId || null;
    if (request.body.role !== undefined) data.role = request.body.role;
    if (request.body.active !== undefined) data.active = request.body.active;
    const updated = await app.prisma.user.update({ where: { id: request.params.id }, data, include: { team: true, store: true } });
    reply.send({ id: updated.id, name: updated.name, role: updated.role, teamName: updated.team?.name, storeName: updated.store?.name, active: updated.active });
  });

  // 重置密码
  app.post('/api/users/:id/reset-password', { preHandler: requireAdmin }, async (request, reply) => {
    const u = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!u) throw new DomainError(404, 'NOT_FOUND', '员工不存在');
    const newPwd = request.body.password || 'Reset123!';
    const hash = await bcrypt.hash(newPwd, 12);
    await app.prisma.user.update({ where: { id: request.params.id }, data: { passwordHash: hash } });
    reply.send({ message: '密码已重置', password: newPwd });
  });
};
