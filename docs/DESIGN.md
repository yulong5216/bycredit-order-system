# 后端技术选型与项目结构

> 版本 1.1 · 第一阶段交付系统主体与 mock 演示闭环，第二阶段替换为真实 VietQR / MobiFone 适配器
> 目标是在 byphone.cn 上按子路径部署，不影响现有 Zalo 小程序和后台
> 原型仓库：https://github.com/yulong5216/bycredit-order-system

**实施原则：** 订单状态机、账单、统一销账、签约结果处理、权限和日志属于核心系统，第一阶段完成；服务商 token、二维码、合同模板、外部状态映射和回调报文全部隔离在适配器内，第二阶段接入。第一阶段只部署开发/演示环境，生产环境禁止 mock 成功入口。

---

## 1. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | **Node.js 20 LTS** | 后端/前端同语言，我们已安装 |
| 框架 | **Fastify** | 比 Express 快，原生 JSON schema 验证，HTTP/2，插件生态成熟 |
| 数据库 | **MySQL 8** | 团队已有项目用，运维熟悉；事务保证订单状态机正确 |
| ORM | **Prisma** | 类型安全、迁移工具链完整、开发体验好 |
| 认证 | **JWT（node-jsonwebtoken）** | 无状态，适合小程序 + 后台 H5 两端共用 |
| 密码 | **bcrypt** | 标准做法 |
| 定时任务 | **node-cron** | 进程内定时执行账单逾期检查 |
| HTTP 客户端 | **undici** | Node 内置，无需额外依赖 |
| 日志 | **pino** | Fastify 默认，结构化 JSON，配合 PM2 滚盘 |
| 环境变量 | **dotenv** | 本地 .env，服务器由 systemd/environment 注入 |
| 部署 | **PM2 + systemd + Nginx** | PM2 管理进程守护，systemd 开机自启，Nginx 路径转发 |

**为什么不选 NestJS？** Fastify 已经够我们用；NestJS 的 DI 体系对 3-4 人团队偏重。

---

## 2. 项目目录

```
bycredit-order-system/
├── prototype/                     ← 现有纯静态原型（保留，不删除）
│   ├── index.html
│   ├── admin-bills.html
│   ├── ...
│   └── assets/
├── backend/                       ← 新建 Node + Fastify + Prisma
│   ├── prisma/
│   │   ├── schema.prisma          ← 数据模型
│   │   └── migrations/
│   ├── src/
│   │   ├── index.js               ← 入口，Fastify.register 所有插件
│   │   ├── config/                ← 全部从 env 读取
│   │   │   ├── index.js           ← byphone.cn 域名、JWT secret、port
│   │   │   ├── integration.js     ← PAYMENT_PROVIDER / ESIGN_PROVIDER，默认 mock
│   │   │   ├── payment.js         ← 第二阶段 VietQR 商户与回调配置
│   │   │   └── store.js           ← 门店收款信息
│   │   ├── plugins/
│   │   │   ├── auth.js            ← JWT 校验、角色解析、Fastify decorators
│   │   │   └── jwt.js             ← @fastify/jwt 注册
│   │   ├── routes/                ← 按领域拆
│   │   │   ├── auth.js            ← /api/auth/login /refresh
│   │   │   ├── orders.js          ← /api/orders/*，含 MDM 与签约内部入口
│   │   │   ├── bills.js           ← /api/bills/*
│   │   │   ├── stores.js          ← /api/stores/*
│   │   │   ├── customers.js       ← /api/customers/*
│   │   │   ├── payment.js         ← /api/payment/generate /status，服务商无关
│   │   │   ├── finance.js         ← /api/finance/*
│   │   │   └── webhook/           ← 第二阶段新增，只允许调用统一结果处理服务
│   │   │       ├── vietqr-token.js        ← VietQR 回调鉴权 GET TOKEN
│   │   │       ├── vietqr-sync.js         ← VietQR transaction-sync
│   │   │       └── mobifone.js            ← 合同级 / 签署人级 Webhook
│   │   ├── services/              ← 第一阶段实现，全部不依赖真实服务商
│   │   │   ├── orderService.js    ← 订单状态机流转 + 日志
│   │   │   ├── billService.js     ← 账单生成、代客登记 + 金额校验
│   │   │   ├── paymentService.js  ← 内部支付请求 + 统一销账 + 幂等
│   │   │   ├── esignService.js    ← 签约次数 + 统一结果处理 + 状态联动
│   │   │   ├── mdmService.js      ← 监管锁记录
│   │   │   └── loanService.js     ← 放款
│   │   ├── providers/             ← 外部能力可替换适配器
│   │   │   ├── mockPaymentProvider.js   ← 第一阶段：显式模拟成功/失败
│   │   │   ├── mockEsignProvider.js     ← 第一阶段：演示签约结果
│   │   │   ├── vietqrProvider.js        ← 第二阶段：token、QR、查单与回调适配
│   │   │   └── mobifoneProvider.js      ← 第二阶段：建合同、状态与 PDF 适配
│   │   ├── domain/
│   │   │   └── constants.js       ← 角色、内部状态机、支付/签约统一状态、错误码
│   │   └── utils/
│   │       ├── shortCode.js        ← 第二阶段：VietQR orderId 短码，规则待确认
│   │       ├── vietqrContent.js   ← 第二阶段：content 23 字符、无声调转换
│   │       └── logger.js
│   ├── .env.example               ← 提交到 Git，不放真实密码
│   ├── package.json
│   └── README.md
├── admin-web/                     ← 新建后台前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/                   ← 各领域 axios 封装
│   │   ├── views/                 ← 对应原型的每个页面
│   │   ├── components/
│   │   ├── stores/                ← Pinia：当前用户权限 + 角色
│   │   ├── router/
│   │   └── App.vue
│   └── package.json
├── .github/workflows/
│   └── deploy.yml                  ← push main 后 SSH 上服务器拉代码、PM2 reload
├── docs/                          ← PRD、接口契约、部署说明
└── README.md
```

标注“第二阶段”的 webhook、真实 provider 和 VietQR 工具文件第一阶段不实现，只在目录设计中保留边界。核心 service 不直接 import 某个真实服务商 SDK，而是根据服务端配置选择 provider；mock 与真实 provider 对核心系统暴露相同的内部能力。

**为什么拆成三个目录？** prototype 保留给参考和演示；backend 和 admin-web 是生产代码；小程序的客户端继续在现有 Zalo 前端项目里开发，调用我们后端的 `/api/payment/*` 端点。

---

## 3. 部署架构（关键）

服务器：byphone.cn（已有）

```
Nginx（443 HTTPS，证书续期用 certbot）
│
├── /                    → 反代到现有 Zalo 前端（不动）
├── /admin               → 反代到现有后台前端（不动）
├── /order-api           → 反代到 Node 后端（新 Fastify，监听 3001）
│   ├── /api/auth/login
│   ├── /api/orders/*
│   ├── /api/payment/generate        ← 第一阶段 mock / 第二阶段真实 QR
│   ├── /api/vietqr/callback/token   ← 第二阶段：VietQR → 我们（POST）
│   └── /api/vietqr/callback/sync    ← 第二阶段：VietQR → 我们（POST）
└── /order-web           → 反代到新后台前端（可选，如果和 /admin 分开）
```

**好处：**
- 现有小程序和后台不受影响，Nginx 按路径转发
- 第一阶段只开放系统内部 API 和演示页面，不需要配置任何第三方公网回调
- 第二阶段 VietQR、MobiFone 回调仍可使用 `/order-api` 下的独立端点，不需要额外域名
- HTTPS 证书一张够，不用额外申请

**PM2 进程：** 单实例。第一阶段不缓存任何第三方 token；第二阶段 VietQR token 在 provider 内按 300 秒有效期缓存并提前换新，不能进入订单核心 service。

---

## 4. 核心服务与第三方接口边界

### 4.1 第一阶段必须稳定的内部能力

- `paymentService`：创建内部支付请求、查询状态、统一销账、金额校验、幂等和日志。mock 成功、未来真实回调及主动查单都只能调用这一销账入口。
- `esignService`：创建签约次数、处理统一签约结果、关联 MDM 状态、推动订单状态机和记录日志。mock 回填与未来 MobiFone Webhook 共用该入口。
- `/api/payment/generate`、`/api/payment/status` 和 `/api/orders/:id/esign/*` 是面向前端的内部契约，第一阶段即保留；切换 provider 时不要求页面重写。
- 核心数据只保存内部统一状态，同时保留 provider、外部请求号/交易号/合同号、原始响应和失败原因，便于第二阶段排障与对账。

### 4.2 VietQR 接口契约（第二阶段，详见 API-CONTRACT.md）

以下为当前调研草案，正式实施前以服务商最终确认为准。`orderId`、`content`、token 和回调报文只在 `vietqrProvider` 及其 webhook 中处理。

### 我们调用 VietQR
| 用途 | URL | Body |
|---|---|---|
| 取 token（每 5 分钟自动续） | `POST https://api.vietqr.org/vqr/api/token_generate` | Basic Auth，返回 300 秒有效 Bearer |
| 生成二维码 | `POST https://api.vietqr.org/vqr/api/qr/generate-customer` | bankCode, bankAccount, userBankName, content(≤23字符), qrType=0, amount, orderId(≤13字符) |

### VietQR 回调我们
| 端点 | 说明 |
|---|---|
| `POST /order-api/api/vietqr/callback/token` | VietQR 为了调用我们 sync 端点先来取 token |
| `POST /order-api/api/vietqr/callback/sync` | 支付回调：bankaccount, amount, orderId, transactionid, transactiontime, referencenumber, content |

**注意：** VietQR 文档里的路径前缀是 `/bank/api/`，但我们放在 `/order-api/api/vietqr/callback/`。VietQR 的 merchant portal 里配置回调地址时填完整 URL 即可，他们不强制路径格式。主动查单、二维码过期和补单策略待最终确认后在 provider 内实现，不默认爬取商户后台。

### 4.3 MobiFone eContract 接口边界（第二阶段）

- `mobifoneProvider` 封装登录、按 JSON/模板创建合同、查询状态、回调状态映射和 PDF 下载；模板 ID、字段映射、签署配置均走配置或独立映射模块。
- Webhook 路由只负责验证 `api-key`、解析和保存原始回调、幂等判断，然后调用 `esignService` 的统一结果处理，不直接修改订单或账单表。
- 合同级与签署人级事件分别保存外部事件标识；同一事件重复到达不得重复推动状态机。
- PDF 临时链接失效前必须转存到受控存储，数据库只保存内部文件地址及外部合同号。
- 具体网络地址、回调路径、字段规则和状态文字待联调确认，第一阶段不写死。

---

## 5. 第三方配置与演示开关

### 5.1 第一阶段：provider 选择

在 `backend/src/config/integration.js` 中集中选择适配器，只能由服务端环境变量控制，前端不得传入 `mock` 或切换真实服务商：

```js
module.exports = {
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
  esignProvider: process.env.ESIGN_PROVIDER || 'mock'
};
```

开发/演示环境使用独立数据库或独立数据集，页面和日志均显示 mock 标识。若 `NODE_ENV=production` 时任一 provider 仍为 `mock`，服务启动必须直接失败，不能依靠前端隐藏按钮兜底。

### 5.2 第二阶段：VietQR 配置

真实商户参数在 `backend/src/config/payment.js` 里集中管理，换银行或 BIDV 只改配置和 VietQR 适配器，不改订单核心服务：

```js
module.exports = {
  // VietQR 商户认证（Basic Auth 用）
  merchantUsername: process.env.VIETQR_MERCHANT_USERNAME,
  merchantPassword: process.env.VIETQR_MERCHANT_PASSWORD,

  // 收款账户（后期 BIDV 只需改这三个）
  bankCode: process.env.VIETQR_BANK_CODE,        // TPBank="970"  BIDV="27"
  bankAccount: process.env.VIETQR_BANK_ACCOUNT,  // 对公账户号
  userBankName: process.env.VIETQR_USER_BANK_NAME, // 英文抬头，无声调

  // 我们给 VietQR 的回调鉴权（自己定，告诉 VietQR）
  callbackUsername: process.env.VIETQR_CALLBACK_USERNAME,
  callbackPassword: process.env.VIETQR_CALLBACK_PASSWORD,

  // 我们的域名（VietQR 商户后台填的回调地址）
  publicBase: 'https://byphone.cn/order-api'
};
```

.env 里只放值，.env.example 只放占位。**不提交真实密码到 Git**。

---

## 6. 环境变量清单

```
# 数据库
DATABASE_URL=mysql://user:pass@localhost:3306/bycredit

# JWT
JWT_SECRET=change-me-please
JWT_EXPIRES_IN=7d

# 第一阶段 provider（仅开发/演示环境）
PAYMENT_PROVIDER=mock
ESIGN_PROVIDER=mock

# 第二阶段 VietQR（真实联调时才配置）
VIETQR_MERCHANT_USERNAME=xxx
VIETQR_MERCHANT_PASSWORD=xxx
VIETQR_BANK_CODE=970
VIETQR_BANK_ACCOUNT=xxx
VIETQR_USER_BANK_NAME=xxx
VIETQR_CALLBACK_USERNAME=xxx
VIETQR_CALLBACK_PASSWORD=xxx

# 服务器
PORT=3001
NODE_ENV=development
BYPHONE_PUBLIC_BASE=https://byphone.cn
```

第二阶段两项对接可以分别完成。真实上线时设置 `NODE_ENV=production`，已完成的 provider 分别切换为 `vietqr` 或 `mobifone` 并补齐环境变量；尚未准备好的能力必须明确配置为人工流程或停用，不能保留 `mock`，也不得通过修改前端参数绕过启动检查。

---

## 7. 开发顺序（两阶段 Action Plan）

### 第一阶段：核心系统与 mock 演示闭环

1. **后端骨架**：Node + Fastify + Prisma + MySQL，建立用户、角色、门店、客户、订单、账单、支付请求、签约记录和操作日志等核心模型。
2. **认证与权限**：JWT、bcrypt、8 角色、动作权限和数据范围，所有后续路由统一接入。
3. **订单状态机**：录单、初审、终审、驳回、取消、财务审批、放款和日志；同步实现 MDM 双字段记录及终审前置条件。
4. **账单与财务**：账单四字段、首期还款日联动、现金/普通转账代客登记、金额校验、逾期与结清、CSV 导出。
5. **统一支付边界**：`paymentService` + 内部支付请求 + 幂等销账；实现 `mockPaymentProvider`，模拟成功与真实回调必须复用同一销账入口。
6. **统一签约边界**：`esignService` + 签约次数 + 统一结果处理；实现 `mockEsignProvider`，完整覆盖成功、失败、重签和 MDM 未绑定场景。
7. **Web 后台前端**：Vue 3 + Vite，按原型实现主体页面，支付和签约区域明确显示“演示”标识。
8. **客户 H5**：订单、账单、还款状态查询；接入演示支付入口和支付状态查询，不展示伪真实二维码。
9. **开发/演示部署与验收**：独立数据库或数据集、PM2 + Nginx、mock 启动保护和全流程验收，不配置真实第三方回调。

第一阶段验收链路：

```text
录单 → 初审 → 演示签约 → MDM 登记 → 终审 → 财务放款 → 生成账单
     → 演示线上还款或人工还款登记 → 最后一期结清
```

同时验证签约失败重签、重复支付幂等、金额异常拦截、角色越权拦截和完整操作日志。

### 第二阶段：真实第三方适配器

1. **VietQR provider**：根据最终确认规则实现 token、真实二维码、短码/content、回调、主动查单、过期和异常对账，统一调用 `paymentService` 销账。
2. **MobiFone provider**：根据最终确认规则实现建合同、短信机制、两级 Webhook、状态映射、幂等和 PDF 转存，统一调用 `esignService` 处理结果。
3. **真实环境联调**：分别验证成功、失败、重复回调、回调丢失补单、外部服务超时和人工兜底。
4. **生产切换**：将已完成对接的 provider 切换为真实实现并配置环境变量，未完成的能力保持人工流程或停用；确认 mock 启动保护生效后，只开放已验收的真实入口。

第二阶段原则上只新增真实 provider、webhook、服务商配置及必要的数据库迁移，不重写订单状态机、账单、权限和前端主流程。

---

## 8. 原型、第一阶段与第二阶段的关系

| | 原型（当前） | 第一阶段（开发/演示） | 第二阶段（真实对接） |
|---|---|---|---|
| 存储 | localStorage | MySQL，独立演示数据 | MySQL 真实业务数据 |
| 认证 | 无（Shell.role 模拟） | JWT + bcrypt | 沿用第一阶段 |
| 签约 | 本地人工回填 | mock provider + 统一签约结果处理 | MobiFone provider + Webhook/查询 + PDF 转存 |
| 支付 | 模拟手动登记 | mock 支付流程 + 真实人工还款登记 + 统一销账 | VietQR provider + 回调/查单 + 统一销账 |
| 页面 | 纯 HTML + 内联 JS | Vue 3 SPA + 客户 H5，演示标识 | 沿用页面，仅切换真实状态与内容 |
| 部署 | 本地 python3 http.server | byphone.cn 开发/演示环境 | byphone.cn 生产环境，禁止 mock |

原型的业务规则（状态机、权限矩阵、账单四字段、MDM 双字段、签约结果与订单联动）保留到核心代码。原型代码放在 `prototype/` 目录作为参考，不参与构建；第三方调研中的临时规则不直接进入核心代码。
