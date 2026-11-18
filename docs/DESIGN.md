# 后端技术选型与项目结构

> 目标是在 byphone.cn 上按子路径部署，不影响现有 Zalo 小程序和后台
> 原型仓库：https://github.com/yulong5216/bycredit-order-system

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
| 定时任务 | **@fastify/cron** | Fastify 插件，在进程内跑 |
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
│   │   │   ├── payment.js         ← VietQR 商户账号（后期换 BIDV 只改这里）
│   │   │   └── store.js           ← 门店收款信息
│   │   ├── plugins/
│   │   │   ├── auth.js            ← JWT 校验、角色解析、Fastify decorators
│   │   │   └── jwt.js             ← @fastify/jwt 注册
│   │   ├── routes/                ← 按领域拆
│   │   │   ├── auth.js            ← /api/auth/login /refresh
│   │   │   ├── orders.js          ← /api/orders/*
│   │   │   ├── bills.js           ← /api/bills/*
│   │   │   ├── stores.js          ← /api/stores/*
│   │   │   ├── customers.js       ← /api/customers/*
│   │   │   ├── payment.js         ← /api/payment/generate（小程序生成二维码）
│   │   │   ├── finance.js         ← /api/finance/*
│   │   │   └── webhook/
│   │   │       ├── vietqr-token.js        ← VietQR 回调鉴权 GET TOKEN
│   │   │       └── vietqr-sync.js         ← VietQR transaction-sync
│   │   ├── services/
│   │   │   ├── orderService.js    ← 订单状态机流转 + 日志
│   │   │   ├── billService.js     ← 账单代客登记 + 金额校验
│   │   │   ├── esignService.js    ← MobiFone 人工签约流程
│   │   │   ├── mdmService.js      ← 监管锁记录
│   │   │   ├── vietqrService.js   ← VietQR token + 生成二维码（调用外部 API）
│   │   │   └── loanService.js     ← 放款
│   │   ├── domain/
│   │   │   └── constants.js       ← 角色列表、状态机枚举、错误码
│   │   └── utils/
│   │       ├── shortCode.js        ← 订单号 → VietQR orderId 短码
│   │       ├── vietqrContent.js   ← content 字段 23 字符、无声调转换
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
│   ├── /api/payment/generate        ← 小程序调的
│   ├── /api/vietqr/callback/token   ← VietQR → 我们（POST）
│   └── /api/vietqr/callback/sync    ← VietQR → 我们（POST）
└── /order-web           → 反代到新后台前端（可选，如果和 /admin 分开）
```

**好处：**
- 现有小程序和后台不受影响，Nginx 按路径转发
- VietQR 回调直接打到我们 `/order-api` 下的两个端点，不需要额外域名
- HTTPS 证书一张够，不用额外申请

**PM2 进程：** 单实例，进程内内存缓存 VietQR token（300 秒有效期，过期自动换新）。

---

## 4. VietQR 接口契约（详见 API-CONTRACT.md）

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

**注意：** VietQR 文档里的路径前缀是 `/bank/api/`，但我们放在 `/order-api/api/vietqr/callback/`。VietQR 的 merchant portal 里配置回调地址时填完整 URL 即可，他们不强制路径格式。

---

## 5. 支付账户配置

在 `backend/src/config/payment.js` 里集中管理，换 BIDV 只改这里：

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

# VietQR（生产）
VIETQR_MERCHANT_USERNAME=xxx
VIETQR_MERCHANT_PASSWORD=xxx
VIETQR_BANK_CODE=970
VIETQR_BANK_ACCOUNT=xxx
VIETQR_USER_BANK_NAME=xxx
VIETQR_CALLBACK_USERNAME=xxx
VIETQR_CALLBACK_PASSWORD=xxx

# 服务器
PORT=3001
NODE_ENV=production
BYPHONE_PUBLIC_BASE=https://byphone.cn
```

---

## 7. 开发顺序（下一轮对话的 Action Plan）

1. **后端骨架**：Node + Fastify + Prisma + MySQL，用户/角色/日志/订单/账单五张表建起来
2. **VietQR 对接**：token 缓存、生成二维码、两个回调端点（token + sync）、回调鉴权、回调销账
3. **订单状态机**：从草稿到还款的完整流转，日志全埋点
4. **Web 后台前端**：Vue 3 + Vite，按原型的页面结构逐个实现
5. **小程序端支付**：客户查账页 + 调 `/api/payment/generate` + 展示二维码 + 轮询支付结果
6. **定时任务**：逾期判定、对账兜底（拉 VietQR 流水补单）
7. **部署**：PM2 + Nginx + HTTPS + 环境变量注入
8. **联调测试**：用 VietQR test 环境跑通完整支付链路

第 1-3 步是后端核心，写完 VietQR 对接就能先跑通一条"生成二维码 → 扫码支付 → 自动销账"的完整链路，不用等前端。

---

## 8. 原型和生产的关系

| | 原型（当前） | 生产（要开发的） |
|---|---|---|
| 存储 | localStorage | MySQL |
| 认证 | 无（Shell.role 模拟） | JWT + bcrypt |
| 支付 | 模拟手动登记 | VietQR API + 回调销账 |
| 页面 | 纯 HTML + 内联 JS | Vue 3 SPA |
| 部署 | 本地 python3 http.server | byphone.cn/order-api + /admin |

原型的业务规则（状态机、权限矩阵、账单四字段、MDM 双字段、MobiFone 人工流程）全部保留到生产代码。原型代码放在 `prototype/` 目录作为参考，不参与构建。
