#!/bin/bash
# 灵集 - 每日热点抓取 (由 /etc/cron.d/lingji-hotspots 触发)
# 内部: 用 CRON_SECRET 鉴权调用 API
CRON_SECRET="${CRON_SECRET:-linggan-cron-secret}"
URL="https://zjsifan.com/api/cron/check-hotspots?secret=${CRON_SECRET}"
LOG="/var/log/lingji-hotspots.log"
echo "[$(date -Iseconds)] 开始抓取热点" >> "$LOG"
RESP=$(curl -sL --max-time 280 "$URL" 2>&1)
echo "$RESP" | head -c 500 >> "$LOG"
echo >> "$LOG"
echo "[$(date -Iseconds)] 完成" >> "$LOG"
