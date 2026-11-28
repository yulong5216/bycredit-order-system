// VietQR 被扫支付二维码生成器
// 协议：VietQR v1.0 (被扫/收款码)
// BIN: A000000727 (所有越南银行 VietQR 共用)
//
// 用法:
//   const payload = vietqr.buildPayload({ account: '0071000999888', amount: 2817778, orderNo: 'L2026...' })
//   const qrDataUrl = await vietqr.toDataUrl(payload)
//
// payload = 纯文本，客户用银行 app 扫能解析出账号和金额
// dataUrl = base64 PNG，前端直接放 <img :src="qrDataUrl" />

const QRCode = require('qrcode');

// ===== CRC16-CCITT (x^16 + x^12 + x^5 + 1) =====
function crc16(buf) {
  let crc = 0xFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return crc & 0xFFFF;
}

// ===== TLV helper: 类型(2字节) + 长度(2字节) + 内容 =====
function tlv(type, value) {
  const len = String(value.length).padStart(2, '0');
  return `${type}${len}${value}`;
}

const VIETQR_BIN = 'A000000727';  // 所有越南银行共用的 VietQR BIN
const CURRENCY_VND = '704';
const COUNTRY_VN = 'VN';

// 构建 VietQR payload (纯文本)
// opts: { account, amount, orderNo?, holder?, dynamic? }
//   account  = 银行账号 (required)
//   amount   = 金额 (required, 越南盾整数)
//   orderNo  = 订单号, 放进 Additional Data → Order 字段
//   dynamic  = true → Dynamic (02), false/undef → Static (11)
function buildPayload({ account, amount, orderNo, dynamic = true }) {
  if (!account) throw new Error('VietQR: account 不能为空');
  if (amount == null) throw new Error('VietQR: amount 不能为空');
  const amt = String(Math.round(Number(amount)));
  const poi = dynamic ? '02' : '11'; // 02=Dynamic 11=Static
  // Merchant Account Info (嵌套 TLV)
  const merchantAccountInfo =
    tlv('00', VIETQR_BIN) +
    tlv('01', account);
  const merchantBlock = tlv('38', merchantAccountInfo);
  // Transaction Info
  const currency = tlv('53', CURRENCY_VND);
  const txnAmount = tlv('54', amt);
  const country = tlv('58', COUNTRY_VN);
  // Additional Data Field Template (可选: 05=Order Number)
  let additionalData = '';
  if (orderNo) {
    additionalData = tlv('05', String(orderNo).slice(0, 25));
  }
  const adfBlock = additionalData ? tlv('62', additionalData) : '';
  // 完整 payload (不含 CRC)
  const body =
    tlv('00', '01') +        // Payload Indicator: 01
    tlv('01', poi) +         // Point of Initiation
    merchantBlock +
    currency +
    txnAmount +
    country +
    adfBlock;
  // CRC16 of entire body
  const crc = crc16(Buffer.from(body, 'utf8'));
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
  return body + tlv('63', crcHex);
}

// 把 payload 渲染成 base64 PNG data URL
async function toDataUrl(payload, opts = {}) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opts.width || 384,
    color: { dark: '#0F1B2D', light: '#FFFFFF' }
  });
}

// 同步生成 (但 QRCode.toDataURL 是 async, 这里用 canvas 不太合适)
function buildPayloadSync(opts) { return buildPayload(opts); }

// 一个小工具函数: 把银行名 + 账号 + 金额 输出成给前端的完整响应
async function buildFull({ account, amount, orderNo, bank, holder, dynamic = true }) {
  const payload = buildPayload({ account, amount, orderNo, dynamic });
  const dataUrl = await toDataUrl(payload);
  return {
    payload,       // 纯文本，客户扫银行 app 直接能解析
    dataUrl,       // base64 PNG
    bank: bank || '',
    account,
    holder: holder || '',
    amount: Number(amount),
    orderNo: orderNo || ''
  };
}

module.exports = { buildPayload, toDataUrl, buildFull };
