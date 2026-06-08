#!/bin/bash
# 灵集 ECS cron 统一执行器
# 用法: bash scripts/cron-runner.sh <endpoint> [port]
# 示例: bash scripts/cron-runner.sh /api/cron/check-hotspots
#
# 从 .env.local 读取 CRON_SECRET，调用本地 Next.js 服务

set -e

ENDPOINT="${1:?缺少 endpoint 参数}"
PORT="${2:-3000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cron-$(echo "$ENDPOINT" | tr '/' '-').log"

# 从 .env.local 读取 CRON_SECRET
CRON_SECRET=""
if [ -f "$PROJECT_DIR/.env.local" ]; then
  CRON_SECRET=$(grep -E '^CRON_SECRET=' "$PROJECT_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
fi
if [ -z "$CRON_SECRET" ]; then
  CRON_SECRET="${CRON_SECRET:-}"
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Running: $ENDPOINT" | tee -a "$LOG_FILE"

HTTP_CODE=$(curl -sS -m 300 -o /tmp/cron-resp.json -w "%{http_code}" \
  "http://localhost:${PORT}${ENDPOINT}?secret=${CRON_SECRET}" 2>/tmp/cron-err.log)

echo "[$TIMESTAMP] HTTP $HTTP_CODE" | tee -a "$LOG_FILE"
cat /tmp/cron-resp.json | tee -a "$LOG_FILE"

# 清理超过 7 天的日志
find "$LOG_DIR" -name "cron-*.log" -mtime +7 -delete 2>/dev/null || true

if [ "$HTTP_CODE" != "200" ]; then
  echo "[$TIMESTAMP] ERROR: $ENDPOINT failed with HTTP $HTTP_CODE" | tee -a "$LOG_FILE"
  cat /tmp/cron-err.log >> "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

echo "" >> "$LOG_FILE"
