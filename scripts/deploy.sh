#!/bin/bash
# 灵集 - 自动部署脚本 (由 GitHub webhook 触发)
# 代码同步: GitHub codeload tarball + PAT (HTTPS 走国内可达, 不需要 SSH key)
set -e

DEPLOY_DIR="/opt/lingji"
LOG_FILE="/var/log/lingji-deploy.log"
TOKEN_FILE="/root/.lingji_github_token"
REPO="MFCR7788/linggan"
BRANCH="main"
TMP_DIR="/tmp/lingji-deploy-$$"
LOCK_FILE="/var/lock/lingji-deploy.lock"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"; }

# 防并发: 同一时间只允许一个部署
exec 9>"$LOCK_FILE"
flock -n 9 || { log "⏳ 上一个部署还在进行, 跳过本次"; exit 0; }

cleanup() { rm -rf "$TMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

log "🚀 开始部署"

# 读 token
if [ ! -f "$TOKEN_FILE" ]; then
  log "❌ 找不到 $TOKEN_FILE, 终止"
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")

cd "$DEPLOY_DIR"

# 1. 记录当前 commit, 用于回滚
OLD_COMMIT=$(sudo -u deploy HOME=/home/deploy git -C "$DEPLOY_DIR" rev-parse HEAD 2>/dev/null || echo "none")
log "📌 当前 commit: $OLD_COMMIT"

# 2. 拉取最新 commit sha
log "🔍 查询远程最新 commit"
NEW_COMMIT=$(curl -sL --max-time 15 \
  -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/commits/$BRANCH" \
  | sed -n 's/.*"sha": "\([0-9a-f]\{40\}\)".*/\1/p' | head -1)
if [ -z "$NEW_COMMIT" ]; then
  log "❌ 无法查询远程 commit, 终止"
  exit 1
fi
log "📌 远程 commit: $NEW_COMMIT"

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  log "✅ 已是最新, 无需部署"
  exit 0
fi

# 3. 下载 tarball
log "📥 下载源码 tarball"
mkdir -p "$TMP_DIR"
curl -sL --max-time 120 \
  -u "x-access-token:$TOKEN" \
  -o "$TMP_DIR/src.tar.gz" \
  "https://codeload.github.com/$REPO/legacy.tar.gz/$BRANCH"
if [ ! -s "$TMP_DIR/src.tar.gz" ]; then
  log "❌ tarball 下载失败, 终止"
  exit 1
fi
log "   $(du -h "$TMP_DIR/src.tar.gz" | cut -f1)"

# 4. 解压
log "📂 解压"
tar xzf "$TMP_DIR/src.tar.gz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)
if [ -z "$SRC_DIR" ]; then
  log "❌ 解压失败, 终止"
  exit 1
fi

# 5. 备份关键文件
[ -f "$DEPLOY_DIR/.env" ] && cp "$DEPLOY_DIR/.env" "$TMP_DIR/.env.bak"
[ -f "$DEPLOY_DIR/next.config.mjs" ] && cp "$DEPLOY_DIR/next.config.mjs" "$TMP_DIR/"

# 6. rsync 同步 (排除敏感/动态目录)
log "🔄 同步文件"
rsync -a --delete \
  --owner --group \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude 'next.config.mjs' \
  "$SRC_DIR/" "$DEPLOY_DIR/"

# 7. 恢复备份
[ -f "$TMP_DIR/.env.bak" ] && cp "$TMP_DIR/.env.bak" "$DEPLOY_DIR/.env" && chown deploy:deploy "$DEPLOY_DIR/.env" && chmod 600 "$DEPLOY_DIR/.env"
[ -f "$TMP_DIR/next.config.mjs" ] && cp "$TMP_DIR/next.config.mjs" "$DEPLOY_DIR/"

# 8. 修正权限
chown -R deploy:deploy "$DEPLOY_DIR"

# 9. 更新 git ref (保持 HEAD 与远程同步)
sudo -u deploy HOME=/home/deploy git -C "$DEPLOY_DIR" update-ref refs/heads/main "$NEW_COMMIT" 2>/dev/null || true
sudo -u deploy HOME=/home/deploy git -C "$DEPLOY_DIR" symbolic-ref HEAD refs/heads/main 2>/dev/null || true

# 10. npm install
log "📦 npm install"
sudo -u deploy HOME=/home/deploy npm install --no-audit --no-fund 2>&1 | tail -5 | tee -a "$LOG_FILE"

# 11. 构建
log "🔨 npm run build"
if ! sudo -u deploy HOME=/home/deploy npm run build 2>&1 | tail -15 | tee -a "$LOG_FILE"; then
  log "❌ 构建失败, 请查看上方日志"
  exit 1
fi

# 12. 重启
log "🔄 重启服务"
systemctl restart lingji
sleep 3

if systemctl is-active --quiet lingji; then
  log "✅ 部署完成 - 当前 $OLD_COMMIT → $NEW_COMMIT"
else
  log "❌ 部署失败 - 服务未运行"
  journalctl -u lingji --no-pager -n 30 | tee -a "$LOG_FILE"
  exit 1
fi
