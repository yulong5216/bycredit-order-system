#!/bin/bash
# BY Credit 订单管理系统 — 本地开发一键启动
# 用法: bash dev.sh [start|stop|restart|status]

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/admin-web"
BE_PORT=3001
FE_PORT=5173
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

echo "============================================"
echo "  BY Credit 本地开发服务"
echo "============================================"

check_port() { lsof -i ":$1" -sTCP:LISTEN -P 2>/dev/null | tail -1; }
be_alive()  { curl -s -o /dev/null -w "%{http_code}" http://localhost:$BE_PORT/api/health 2>/dev/null | grep -q 200; }
fe_alive()  { curl -s -o /dev/null -w "%{http_code}" http://localhost:$FE_PORT/order-web/login 2>/dev/null | grep -q 200; }

cmd_stop() {
  echo "🟡 停止已有进程..."
  pkill -f "node.*src/index.js"   2>/dev/null || true
  pkill -f "vite"                 2>/dev/null || true
  sleep 1
  echo "✅ 已清理"
}

cmd_start() {
  # 后端
  if be_alive; then
    echo "🟢 后端已在运行 (http://localhost:$BE_PORT)"
  else
    echo "🔵 启动后端..."
    cd "$BACKEND"
    nohup node src/index.js > "$LOG_DIR/backend.log" 2>&1 &
    BE_PID=$!
    sleep 2
    for i in $(seq 1 10); do
      if be_alive; then echo "✅ 后端就绪 (PID $BE_PID)"; break; fi
      sleep 1
    done
    be_alive || { echo "❌ 后端启动失败，看日志: tail -f $LOG_DIR/backend.log"; exit 1; }
  fi

  # 前端
  if fe_alive; then
    echo "🟢 前端已在运行 (http://localhost:$FE_PORT)"
  else
    echo "🔵 启动前端..."
    cd "$FRONTEND"
    nohup npm run dev -- --host > "$LOG_DIR/frontend.log" 2>&1 &
    FE_PID=$!
    sleep 3
    for i in $(seq 1 10); do
      if fe_alive; then echo "✅ 前端就绪 (PID $FE_PID)"; break; fi
      sleep 1
    done
    fe_alive || { echo "❌ 前端启动失败，看日志: tail -f $LOG_DIR/frontend.log"; exit 1; }
  fi

  echo ""
  echo "============================================"
  echo "  🎉 所有服务已就绪"
  echo "============================================"
  echo "  后端 API    http://localhost:$BE_PORT"
  echo "  前端后台    http://127.0.0.1:$FE_PORT/order-web/login"
  echo "  客户账单页  http://127.0.0.1:$FE_PORT/order-web/customer"
  echo ""
  echo "  员工账号 (密码统一: qwe123)"
  echo "    admin   / qwe123    管理员"
  echo "    sales   / qwe123    业务员"
  echo "    first   / qwe123    初审"
  echo "    final   / qwe123    终审"
  echo "    finance / qwe123    财务"
  echo ""
  echo "  客户账单页 (OTP: 123456)"
  echo "    0923456789 / 123456"
  echo "============================================"
}

cmd_status() {
  echo "后端 端口$BE_PORT: $(check_port $BE_PORT | grep -q node && echo '✅ 运行' || echo '❌ 离线')"
  echo "前端 端口$FE_PORT: $(check_port $FE_PORT | grep -q node && echo '✅ 运行' || echo '❌ 离线')"
}

case "${1:-start}" in
  start)   cmd_start   ;;
  stop)    cmd_stop    ;;
  restart) cmd_stop; cmd_start ;;
  status)  cmd_status  ;;
  *) echo "用法: bash dev.sh [start|stop|restart|status]" ;;
esac
