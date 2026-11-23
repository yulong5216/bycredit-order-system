const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const config = require('../config');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { text, phone } = require('../utils/validation');
const { transaction } = require('./orderService');

const QR_FILE_TYPES = Object.freeze({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' });

function qrPath(storeId, storageName) {
  assert(/^payee_qr_[a-f0-9-]+\.(jpg|png|webp)$/.test(storageName || ''), 404, 'NOT_FOUND', '二维码不存在');
  return path.join(config.uploadDir, 'stores', storeId, storageName);
}

async function list(prisma, actor, query) {
  const where = {};
  if (['manager', 'sales'].includes(actor.role)) where.id = actor.storeId;
  if (query.status && query.status !== 'all') where.status = query.status;
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { contact: { contains: q } }, { phone: { contains: q } }];
  }
  const items = await prisma.store.findMany({ where, include: { _count: { select: { orders: true } } }, orderBy: { createdAt: 'desc' } });
  return { items, total: items.length };
}

async function create(prisma, actor, payload) {
  return transaction(prisma, async tx => {
    const code = text(payload.code, '门店编码').toUpperCase();
    const store = await tx.store.create({
      data: {
        code,
        name: text(payload.name, '门店名称'),
        city: text(payload.city, '城市', false),
        type: payload.type || 'partner',
        status: 'active',
        rating: 'A',
        address: text(payload.address, '地址', false),
        contact: text(payload.contact, '联系人', false),
        phone: payload.phone ? phone(payload.phone) : '',
        agreement: payload.agreement || 'pending',
        payee: {
          bank: text(payload.payee && payload.payee.bank, '开户银行', false),
          account: text(payload.payee && payload.payee.account, '收款账号', false),
          holder: text(payload.payee && (payload.payee.holder || payload.payee.name), '收款户名', false)
        }
      }
    });
    await audit(tx, { storeId: store.id, actor, action: '新增门店', before: null, after: store, note: payload.note });
    return store;
  });
}

async function update(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const store = await tx.store.findUnique({ where: { id } });
    assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
    if (actor.role === 'manager') assert(actor.storeId === store.id, 403, 'FORBIDDEN', '只能修改本店信息');
    const allowed = ['name', 'city', 'type', 'address', 'contact', 'agreement'];
    const data = {};
    for (const key of allowed) if (payload[key] !== undefined) data[key] = text(payload[key], key, false);
    if (payload.phone !== undefined) data.phone = payload.phone ? phone(payload.phone) : '';
    if (payload.payee) {
      const current = store.payee || {};
      data.payee = {
        bank: text(payload.payee.bank ?? current.bank, '开户银行', false),
        account: text(payload.payee.account ?? current.account, '收款账号', false),
        holder: text(payload.payee.holder ?? payload.payee.name ?? current.holder ?? current.name, '收款户名', false),
        qr: current.qr || null
      };
    }
    const updated = await tx.store.update({ where: { id: store.id }, data });
    await audit(tx, { storeId: store.id, actor, action: '修改门店', before: store, after: updated, note: payload.note });
    return updated;
  });
}

async function rating(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const store = await tx.store.findUnique({ where: { id } });
    assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
    const rating = text(payload.rating, '评级').toUpperCase();
    assert(['A', 'B', 'C', 'D'].includes(rating), 400, 'VALIDATION_ERROR', '评级仅支持 A、B、C、D');
    const updated = await tx.store.update({ where: { id }, data: { rating } });
    await audit(tx, { storeId: store.id, actor, action: '门店评级', before: store.rating, after: rating, note: payload.note });
    return updated;
  });
}

async function status(prisma, actor, id, payload) {
  return transaction(prisma, async tx => {
    const store = await tx.store.findUnique({ where: { id } });
    assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
    const status = text(payload.status, '状态');
    assert(['active', 'frozen'].includes(status), 400, 'VALIDATION_ERROR', '门店状态不正确');
    const note = status === 'frozen' ? text(payload.note, '冻结原因') : text(payload.note, '备注', false);
    const updated = await tx.store.update({ where: { id }, data: { status } });
    await audit(tx, { storeId: store.id, actor, action: status === 'frozen' ? '冻结门店' : '启用门店', before: store.status, after: status, note });
    return updated;
  });
}

async function uploadPayeeQr(prisma, actor, id, file) {
  assert(file, 400, 'QR_REQUIRED', '请选择二维码图片');
  const extension = QR_FILE_TYPES[file.mimetype];
  assert(extension, 400, 'INVALID_FILE_TYPE', '仅支持 JPG、PNG、WEBP 图片');
  const store = await prisma.store.findUnique({ where: { id } });
  assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
  if (actor.role === 'manager') assert(actor.storeId === store.id, 403, 'FORBIDDEN', '只能修改本店信息');
  const buffer = await file.toBuffer();
  assert(buffer.length > 0, 400, 'EMPTY_FILE', '不能上传空文件');
  assert(buffer.length <= config.uploadMaxBytes, 413, 'FILE_TOO_LARGE', '图片不能超过 10 MB');
  const storageName = `payee_qr_${randomUUID()}${extension}`;
  const target = qrPath(store.id, storageName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { flag: 'wx' });
  const metadata = {
    name: path.basename(String(file.filename || 'payee_qr')).replace(/[\u0000\r\n"]/g, '_').slice(0, 180),
    size: buffer.length,
    type: file.mimetype,
    at: new Date().toISOString(),
    storageName
  };
  return transaction(prisma, async tx => {
    const current = await tx.store.findUnique({ where: { id: store.id } });
    const payee = { ...(current.payee || {}), qr: metadata };
    const updated = await tx.store.update({ where: { id: store.id }, data: { payee } });
    await audit(tx, { storeId: store.id, actor, action: '上传门店收款二维码', before: current.payee?.qr || null, after: metadata });
    const previous = current.payee?.qr;
    if (previous?.storageName && previous.storageName !== storageName) await fs.unlink(qrPath(store.id, previous.storageName)).catch(() => {});
    return updated;
  });
}

async function getPayeeQr(prisma, actor, id) {
  const store = await prisma.store.findUnique({ where: { id } });
  assert(store, 404, 'STORE_NOT_FOUND', '门店不存在');
  if (actor.role === 'manager') assert(actor.storeId === store.id, 403, 'FORBIDDEN', '只能查看本店信息');
  const qr = store.payee?.qr;
  assert(qr?.storageName, 404, 'NOT_FOUND', '门店未上传收款二维码');
  const target = qrPath(store.id, qr.storageName);
  let stat;
  try { stat = await fs.stat(target); } catch { assert(false, 404, 'NOT_FOUND', '二维码不存在或已移除'); }
  assert(stat.isFile(), 404, 'NOT_FOUND', '二维码不存在');
  return { qr, target, size: stat.size };
}

module.exports = { list, create, update, rating, status, uploadPayeeQr, getPayeeQr };
