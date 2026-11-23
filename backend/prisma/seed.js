const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD || 'Bycredit123!';

async function main() {
  // 团队（name 不是 unique，用 findFirst + create/update）
  let teamA = await prisma.team.findFirst({ where: { name: 'HN 销售一队' } });
  if (!teamA) teamA = await prisma.team.create({ data: { name: 'HN 销售一队', manager: 'Lê Thị Hoa', city: 'Hà Nội', remark: 'Hà Nội 市中心门店业务员组' } });
  let teamB = await prisma.team.findFirst({ where: { name: 'ĐN 销售一队' } });
  if (!teamB) teamB = await prisma.team.create({ data: { name: 'ĐN 销售一队', manager: 'Trần Quốc Bảo', city: 'Đà Nẵng', remark: 'Đà Nẵng 门店业务员组' } });

  const store = await prisma.store.upsert({
    where: { code: 'DN' },
    update: {},
    create: {
      code: 'DN',
      name: 'BY Đà Nẵng',
      city: 'Đà Nẵng',
      type: 'partner',
      status: 'active',
      rating: 'A',
      address: '58 Nguyễn Chí Thanh',
      contact: 'Trần Quốc Bảo',
      phone: '0900111222',
      agreement: 'active',
      payee: { bank: 'Vietcombank Đà Nẵng', account: '0071000999888', holder: 'CÔNG TY BY ĐÀ NẴNG' }
    }
  });
  const taoStore = await prisma.store.upsert({
    where: { code: 'THN' },
    update: {},
    create: {
      code: 'THN',
      name: 'Táo Hà Nội',
      city: 'Hà Nội',
      type: 'partner',
      status: 'active',
      rating: 'A',
      address: 'Hà Nội',
      contact: 'Táo Hà Nội',
      phone: '0900111333',
      agreement: 'active',
      payee: { bank: 'MB Bank', account: '102887285193', holder: 'HO KINH DOANH TAO HA NOI' }
    }
  });
  const users = [
    ['admin', '系统管理员', 'admin', null, null],
    ['sales', 'Nguyễn Văn An', 'sales', store.id, teamB.id],
    ['sales2', 'Trần Văn Bình', 'sales', taoStore.id, teamA.id],
    ['first', '初审员', 'first', null, null],
    ['final', '终审员', 'final', null, null],
    ['finance', '财务员', 'finance', null, null],
    ['manager', '店长', 'manager', store.id, teamB.id],
    ['aftercare', '售后专员', 'aftercare', null, null],
    ['collector', '催收专员', 'collector', null, null]
  ];
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [username, name, role, storeId, teamId] of users) {
    await prisma.user.upsert({
      where: { username },
      update: { name, role, storeId, teamId, active: true },
      create: { username, name, role, storeId, teamId, passwordHash }
    });
  }
  console.log(`已初始化 ${users.length} 个角色账号及门店 ${store.name}`);
  console.log(`开发账号密码：${password}（请仅用于本地/演示环境）`);
}

main().finally(() => prisma.$disconnect());
