#!/bin/bash
# Revideo 渲染微服务启动脚本 — 42 ECS
# MIT 许可，无水印，免费商用
# 用法: REVIDEO_SECRET=xxx ./scripts/start-revideo-server.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

PORT="${REVIDEO_PORT:-3101}"
SECRET="${REVIDEO_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "❌ 缺少 REVIDEO_SECRET 环境变量"
  echo "用法: REVIDEO_SECRET=xxx $0"
  exit 1
fi

export CHROMIUM_PATH="${CHROMIUM_PATH:-/usr/bin/chromium-browser}"

# 检查 Chromium
if [ ! -f "$CHROMIUM_PATH" ]; then
  echo "❌ Chromium 未找到: $CHROMIUM_PATH"
  echo "安装: apt-get install -y chromium-browser"
  exit 1
fi

echo "=== Revideo 渲染微服务 ==="
echo "端口: $PORT"
echo "Chromium: $CHROMIUM_PATH"
echo "许可: MIT — 免费商用，无水印"
echo ""

# 使用 pm2 管理进程
if command -v pm2 &> /dev/null; then
  pm2 delete revideo-server 2>/dev/null || true
  pm2 start src/revideo/server.ts \
    --name revideo-server \
    --interpreter tsx \
    --env "REVIDEO_PORT=$PORT" \
    --env "REVIDEO_SECRET=$SECRET" \
    --env "CHROMIUM_PATH=$CHROMIUM_PATH"
  pm2 save
  echo ""
  echo "✅ Revideo Server 已启动 (pm2: revideo-server)"
  echo "健康检查: curl http://localhost:$PORT/health"
else
  echo "⚠️  pm2 未安装，直接启动..."
  npx tsx src/revideo/server.ts
fi
