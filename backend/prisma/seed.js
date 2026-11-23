const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD || 'Bycredit123!';

async function main() {
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
    ['admin', '系统管理员', 'admin', null],
    ['sales', 'Nguyễn Văn An', 'sales', store.id],
    ['sales2', 'Trần Văn Bình', 'sales', taoStore.id],
    ['first', '初审员', 'first', null],
    ['final', '终审员', 'final', null],
    ['finance', '财务员', 'finance', null],
    ['manager', '店长', 'manager', store.id],
    ['aftercare', '售后专员', 'aftercare', null],
    ['collector', '催收专员', 'collector', null]
  ];
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [username, name, role, storeId] of users) {
    await prisma.user.upsert({
      where: { username },
      update: { name, role, storeId, active: true },
      create: { username, name, role, storeId, passwordHash }
    });
  }
  console.log(`已初始化 ${users.length} 个角色账号及门店 ${store.name}`);
  console.log(`开发账号密码：${password}（请仅用于本地/演示环境）`);
}

main().finally(() => prisma.$disconnect());
