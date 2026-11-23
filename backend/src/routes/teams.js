const { DomainError } = require('../domain/errors');

module.exports = async function teamRoutes(app) {
  const requireAdmin = [app.authenticate, (request, reply, done) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ code: 'FORBIDDEN', message: '仅管理员可管理团队' });
    done();
  }];

  app.get('/api/teams', { preHandler: [app.authenticate] }, async request => {
    const where = request.user.role === 'admin' ? {} : { active: true };
    const teams = await app.prisma.team.findMany({ where, include: { users: true }, orderBy: { createdAt: 'desc' } });
    return teams.map(t => ({ id: t.id, name: t.name, manager: t.manager, city: t.city, active: t.active, userCount: t.users.length }));
  });

  app.post('/api/teams', { preHandler: requireAdmin }, async request => {
    const { name, manager = '', city = '', active = true, remark = '' } = request.body;
    const team = await app.prisma.team.create({ data: { name, manager, city, active, remark } });
    return team;
  });

  app.patch('/api/teams/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const data = {};
    if (request.body.name !== undefined) data.name = request.body.name;
    if (request.body.manager !== undefined) data.manager = request.body.manager;
    if (request.body.city !== undefined) data.city = request.body.city;
    if (request.body.active !== undefined) data.active = request.body.active;
    if (request.body.remark !== undefined) data.remark = request.body.remark;
    const updated = await app.prisma.team.update({ where: { id: request.params.id }, data });
    reply.send(updated);
  });
};
