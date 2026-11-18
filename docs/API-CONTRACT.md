# API 接口契约

> 后端：Fastify 监听 3001，部署在 byphone.cn/order-api 路径前缀下
> 前端（小程序 / 后台 H5）调用：https://byphone.cn/order-api/api/*
> 所有端点返回 `{ code, data, message }` 结构，code=200 成功，其他失败

---

## 1. 认证

### POST /api/auth/login
**入参**：`{ username: string, password: string }`
**返回**：
```json
{
  "code": 200,
  "data": {
    "token": "jwt-token",
    "user": { "id": 1, "name": "林初审", "role": "first", "storeId": null }
  }
}
```
**说明**：role 范围见 PRD §2。后台 8 角色走这套；小程序客户端用手机号 + 验证码走另一个 `/api/auth/customer-login`。

### POST /api/auth/customer-login
**入参**：`{ phone: string, code: string }`
**返回**：`{ token, customerId }`
**说明**：小程序端。code 演示期可以固定 `123456`；生产走短信平台。

---

## 2. VietQR 外部调用（我们 → VietQR）

### 2.1 POST /vqr/api/token_generate（每次用）
**服务端**：`https://api.vietqr.org`（Dev：`https://dev.vietqr.org`）
**Headers**：
```
Authorization: Basic base64(username:password)
Content-Type: application/json
```
**Body**：空 JSON 对象 `{}`（他们文档里 Body 字段好像是返回字段，入参只需 Basic Auth）
**返回**：
```json
{ "access_token": "bearer_token", "token_type": "Bearer", "expires_in": 300 }
```
**缓存策略**：后端进程内缓存，`expires_in - 60` 秒时自动换新。

### 2.2 POST /vqr/api/qr/generate-customer（每期账单生成一次）
**Headers**：
```
Authorization: Bearer <上一步 token>
Content-Type: application/json
```
**Body**：
```json
{
  "bankCode": "970",
  "bankAccount": "00001234501",
  "userBankName": "BY CREDIT JOINT STOCK COMPANY",
  "content": "P001234501 KY HOAN 01",
  "qrType": 0,
  "amount": 1593333,
  "orderId": "P001234501",
  "transType": "C"
}
```
**字段约束（必须处理）**：
- `content` ≤ 23 字符、无声调、无特殊符号 → `vietqrContent.js` 做转换
- `orderId` ≤ 13 字符 → `shortCode.js` 生成
- `amount` 为整数（越南盾）
**返回**：
```json
{
  "qrCode": "000201...",     // VietQR 标准码
  "qrLink": "https://pro.vietqr.vn/qr-generated?token=xxx",
  "imgId": "uuid",
  "transactionRefId": "uuid"
}
```
**我们存**：`qrCode`、`qrLink`、`transactionRefId`、`imgId` 存进 `payment_record` 表。

---

## 3. VietQR 回调（VietQR → 我们）

### 3.1 POST /api/vietqr/callback/token（VietQR 为调 sync 端点先来取 token）
**注意**：文档里 VietQR 调用我们的端点路径是他们自己在后台配置的。我们用 `/order-api/api/vietqr/callback/token`，告诉 VietQR 完整 URL：`https://byphone.cn/order-api/api/vietqr/callback/token`。

**Headers**：
```
Authorization: Basic base64(callbackUsername:callbackPassword)
Content-Type: application/json
```
**Body**：空 `{}`
**返回**：
```json
{
  "access_token": "Bearer-我们生成的JWT",
  "token_type": "Bearer",
  "expires_in": 300
}
```
**我们生成的 token**：签名用自己的 secret，payload 里 `aud: "vietqr-sync"`，过期 300 秒。sync 端点校验这个 token。

### 3.2 POST /api/vietqr/callback/sync（支付变动回调）
**Headers**：
```
Authorization: Bearer <上一步 token>
Content-Type: application/json
```
**Body**：
```json
{
  "bankaccount": "00001234501",
  "amount": 1593333,
  "transType": "C",
  "content": "P001234501 KY HOAN 01",
  "transactionid": "TXN20261118001",
  "transactiontime": 1752934100000,
  "referencenumber": "MB20261118001",
  "orderId": "P001234501"
}
```
**处理流程**：
1. 校验 Bearer token（我们在上一个端点签的）
2. 校验 `transType === "C"`（只处理收入）
3. 反查 `orderId` → `payment_record.shortCode` → `bill.id` → `order.id`
4. **幂等**：`transactionid` 在 `payment_record` 表里已存在 → 直接返回 200，不重复销账
5. 校验金额：`bill.amount === callback.amount`，不符 → 记异常日志，返回 200 但 `error: true`
6. 销账：更新 `bill.status = "Paid"`、`bill.paidAt`、`bill.txnNo = transactionid`、`bill.payChannel = "线上QR"`
7. 如果这是最后一期 → 订单状态机流转到 `closed`
8. 写操作日志（action: "客户扫码支付"，role: "系统"，note: "VietQR 回调"）
9. **必返回**：
```json
{ "error": false, "errorReason": null, "toastMessage": "OK", "object": { "reftransactionid": "TXN20261118001" } }
```

**异常处理**：
| 场景 | 我们做 | 返回 VietQR |
|---|---|---|
| token 无效 / 过期 | 401 | `{ error: true, errorReason: "INVALID_TOKEN" }` |
| orderId 找不到 | 记日志 | 200 但 `error: true`（VietQR 会重试） |
| transactionid 重复 | 记日志，不重复销账 | 200 `error: false` |
| 金额不符 | 记日志 | 200 `error: true` |
| 服务器异常 | 500 | `{ error: true, errorReason: "TRANSACTION_FAILED" }` |

---

## 4. 我们内部 API 清单

### 4.1 订单 `/api/orders`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| POST | `/` | 新建草稿 | sales |
| GET | `/` | 列表（按状态、门店、业务员筛选） | 全员（data scope） |
| GET | `/:id` | 详情 + 历史客户风险（同证件号标绿标红） | 全员 |
| PUT | `/:id` | 改客户/设备信息 | sales（自己的）/admin |
| POST | `/:id/submit` | 提交初审 | sales |
| POST | `/:id/first-review` | 初审通过/驳回 | first |
| POST | `/:id/final-review` | 终审通过/驳回 | final |
| POST | `/:id/cancel` | 取消订单 | admin |

### 4.2 账单 `/api/orders/:id/bills`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| GET | `/` | 列出每期账单 + 是否已还 + 支付记录 | 全员 |
| PUT | `/plan` | 改四字段（首付款/分期额/期数/每期金额） | first（初审前）/admin |
| POST | `/:period/pay` | 代客登记（支付订单号、渠道、时间必填） | finance |
| POST | `/:period/defer` | 延期（天数 + 原因） | finance |
| POST | `/:period/breach` | 标记坏账（原因） | finance |
| POST | `/:period/vietqr` | **生成 VietQR 短码 + 二维码** | customer（小程序）/finance |

### 4.3 支付 `/api/payment`（小程序调）
| Method | Path | 说明 |
|---|---|---|
| POST | `/generate` | 入参 { orderId, period }，返回 { shortCode, qrLink, qrCode, expiresAt } | customer |
| GET | `/status` | 入参 { shortCode }，返回 { paid: bool, paidAt, txnNo } | customer |

### 4.4 MDM `/api/orders/:id/mdm`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| POST | `/bind` | 入参 { serial, imei }（都必填） | first/admin |
| POST | `/unbind` | 入参 { note }（原因必填） | first/admin |

### 4.5 电子签约 `/api/orders/:id/esign`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| POST | `/download-csv` | 返回客户资料表格 CSV 下载 | first/admin |
| POST | `/start` | 入参 { fileName }（登记已上传 MobiFone） | first/admin |
| POST | `/simulate` | 入参 { ok, reason, contractNo }（回填签署结果） | first/admin |

### 4.6 门店 `/api/stores`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| GET | `/` | 列表（店长只看本店） | 全员 |
| POST | `/` | 新建 | admin |
| PUT | `/:id` | 编辑 | manager（本店）/admin |
| POST | `/:id/rating` | 改评级 + 原因 | admin |
| POST | `/:id/status` | 冻结/恢复 + 原因 | admin |

### 4.7 财务 `/api/finance`
| Method | Path | 说明 | 角色 |
|---|---|---|---|
| GET | `/orders` | 待审批/待放款列表 | finance |
| POST | `/:orderId/approve` | 审批通过（进入待放款） | finance |
| POST | `/:orderId/payout` | 录入放款回单 | finance |
| GET | `/export` | 报税 CSV（17 列，UTF-8 BOM） | finance |

### 4.8 日志 `/api/logs`
| Method | Path | 说明 |
|---|---|---|
| GET | `/order/:orderId` | 订单完整操作日志（所有人可看） | 全员 |
| GET | `/store/:storeId` | 门店日志 | 全员 |

---

## 5. 错误码

| code | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 参数校验失败 |
| 401 | 未登录 / token 无效 |
| 403 | 角色无权操作 |
| 404 | 订单/门店/账单不存在 |
| 409 | 状态不允许当前操作（如已初审不能再改） |
| 500 | 服务器内部错误（VietQR 调用失败等） |
| 502 | VietQR 接口不可用 |

VietQR 回调端点的错误码不走这套，按 VietQR 文档返回他们要求的结构。

---

## 6. 金额单位

后端**统一用整数存越南盾**，不存小数。前端显示时按千分位格式化。

---

## 7. 短码生成规则

```js
// 输入："N20261114001234501", period=1
// 输出："P001234501"  (P + 订单号后8位)
// 长度：9 字符，远小于 VietQR 13 字符限制
// 同订单不同期次可以共用一个短码（但每期建议独立，方便对账）
function genShortCode(orderNo, period) {
  const suffix = orderNo.slice(-8);      // "001234501"
  return 'P' + suffix;                   // "P001234501"
}
```

---

## 8. 回调兜底策略

VietQR 未公开主动查单接口。回调丢失时的兜底：

1. **定时任务 cron**：每 10 分钟拉 VietQR 商户后台的"今日交易"列表（如果有导出 API；没有就爬他们的 web 页面）
2. **匹配逻辑**：按 `referencenumber` 或 `orderId` 短码匹配我们未销账的账单
3. **自动销账**：匹配成功 + 金额一致 → 直接走和回调相同的销账逻辑
4. **告警**：超过 24 小时未销账 + 回调没收到 → 财务后台显示"待人工核对"列表
