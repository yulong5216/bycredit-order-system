# BY Credit · 越南手机分期录单与订单管理

## 仓库结构

```
bycredit-order-system/
├── prototype/         ← 当前纯静态原型（HTML/CSS/JS + localStorage）
├── backend/           ← 待开发：Node 20 + Fastify + Prisma + MySQL
├── admin-web/         ← 待开发：后台前端（Vue 3 + Vite）
├── docs/
│   ├── PRD.md          业务规则、状态机、角色权限（已拍板）
│   ├── DESIGN.md       技术选型、目录结构、部署架构
│   └── API-CONTRACT.md 接口契约（VietQR + 我们对外 API）
└── README.md
```

## 当前状态

**原型已完成**，可本地预览：

```bash
cd prototype && python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/index.html
```

## 后端开发路线图

1. 搭后端骨架（Fastify + Prisma + MySQL + JWT）
2. VietQR 对接（token 缓存、生成二维码、两个回调端点）
3. 订单状态机 + 账单 + 日志完整流转
4. 管理后台前端（Vue 3 + Vite）
5. 小程序端 VietQR 支付集成
6. 定时对账 + 回调丢失兜底

详见 `docs/`。

## 部署

服务器：`byphone.cn`，Nginx 按路径转发：

- `/` → 现有 Zalo 小程序前端
- `/admin` → 现有后台前端
- `/order-api` → **新后端**（Node，监听 3001）
- `/order-web` → 新后台前端（可选）

VietQR 回调地址填：
- `POST https://byphone.cn/order-api/api/vietqr/callback/token`
- `POST https://byphone.cn/order-api/api/vietqr/callback/sync`
