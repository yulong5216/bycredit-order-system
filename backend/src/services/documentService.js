const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const config = require('../config');
const { ACTIVE_ORDER_STATUSES, ORDER_STATUS, REQUIRED_DOCS } = require('../domain/constants');
const { assert } = require('../domain/errors');
const { audit } = require('../utils/audit');
const { toOrderDto } = require('../utils/dto');
const { transaction, findOrder, assertOrderAccess, detailInclude } = require('./orderService');

const DOC_KEYS = new Set([...REQUIRED_DOCS, 'emergency_contact_photo', 'payee_qr', 'other']);
const FILE_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf'
});

function originalName(value) {
  return path.basename(String(value || 'document')).replace(/[\u0000\r\n"]/g, '_').slice(0, 180);
}
function filePath(orderId, storageName) {
  assert(/^[a-f0-9-]+\.(jpg|png|webp|heic|heif|pdf)$/.test(storageName || ''), 404, 'DOCUMENT_NOT_FOUND', '影像文件不存在');
  return path.join(config.uploadDir, orderId, storageName);
}
function assertEditable(order) {
  assert(!order.payoutAt && !ACTIVE_ORDER_STATUSES.includes(order.status) && order.status !== ORDER_STATUS.CANCELLED, 409, 'INVALID_STATE', '放款、逾期、坏账、结清或取消后不可修改影像资料');
}
async function removeFile(orderId, doc) {
  if (!doc?.storageName) return;
  await fs.unlink(filePath(orderId, doc.storageName)).catch(() => {});
}

async function uploadDocument(prisma, actor, id, key, file) {
  assert(DOC_KEYS.has(key), 400, 'INVALID_DOCUMENT_TYPE', '不支持的影像资料类型');
  assert(file, 400, 'DOCUMENT_REQUIRED', '请选择需要上传的文件');
  const extension = FILE_TYPES[file.mimetype];
  assert(extension, 400, 'INVALID_FILE_TYPE', '仅支持 JPG、PNG、WEBP、HEIC、HEIF 或 PDF 文件');

  const existing = await findOrder(prisma, id, { customer: true });
  assertOrderAccess(existing, actor);
  assertEditable(existing);
  const buffer = await file.toBuffer();
  assert(buffer.length > 0, 400, 'EMPTY_FILE', '不能上传空文件');
  assert(buffer.length <= config.uploadMaxBytes, 413, 'FILE_TOO_LARGE', '单个文件不能超过 10 MB');

  const storageName = `${randomUUID()}${extension}`;
  const target = filePath(existing.id, storageName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { flag: 'wx' });
  const metadata = {
    name: originalName(file.filename),
    size: buffer.length,
    type: file.mimetype,
    at: new Date().toISOString(),
    storageName,
    url: `/api/orders/${existing.id}/docs/${key}/content`
  };

  try {
    const updated = await transaction(prisma, async tx => {
      const order = await findOrder(tx, existing.id, { customer: true });
      assertOrderAccess(order, actor);
      assertEditable(order);
      const docs = { ...(order.docs || {}), [key]: metadata };
      const saved = await tx.order.update({ where: { id: order.id }, data: { docs }, include: detailInclude });
      await audit(tx, {
        orderId: order.id,
        storeId: order.storeId,
        actor,
        action: '上传影像资料',
        before: order.docs?.[key] || null,
        after: metadata,
        note: `资料类型：${key}`
      });
      return saved;
    });
    const previous = existing.docs?.[key];
    if (previous?.storageName && previous.storageName !== storageName) await removeFile(existing.id, previous);
    return toOrderDto(updated);
  } catch (error) {
    await fs.unlink(target).catch(() => {});
    throw error;
  }
}

async function getDocument(prisma, actor, id, key) {
  assert(DOC_KEYS.has(key), 404, 'DOCUMENT_NOT_FOUND', '影像资料不存在');
  const order = await findOrder(prisma, id, { customer: true });
  assertOrderAccess(order, actor);
  const doc = order.docs?.[key];
  assert(doc?.storageName, 404, 'DOCUMENT_NOT_FOUND', '影像文件不存在');
  const target = filePath(order.id, doc.storageName);
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    assert(false, 404, 'DOCUMENT_NOT_FOUND', '影像文件不存在或已移除');
  }
  assert(stat.isFile(), 404, 'DOCUMENT_NOT_FOUND', '影像文件不存在');
  return { doc, target, size: stat.size };
}

module.exports = { uploadDocument, getDocument, DOC_KEYS, FILE_TYPES };
