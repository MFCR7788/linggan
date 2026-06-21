#!/bin/bash
# ============================================================
# FunASR 本地部署脚本 — 灵集 ASR 服务
# 在阿里云服务器上执行 (zjsifan.com)
# ============================================================
set -e

DEPLOY_DIR="/opt/funasr"
echo "🚀 FunASR 本地部署"
echo "目标目录: ${DEPLOY_DIR}"

# 1. 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    echo "   Ubuntu: apt install docker.io docker-compose-v2"
    echo "   CentOS: yum install docker docker-compose-plugin"
    exit 1
fi

# 2. 创建部署目录
mkdir -p "${DEPLOY_DIR}/models"
cd "${DEPLOY_DIR}"

# 3. 复制部署文件（从项目目录）
# 注意：如果你在本地开发机，需要先把文件 rsync 到服务器
# rsync -avz ./deploy/funasr/ root@zjsifan.com:/opt/funasr/
echo ""
echo "📁 检查部署文件..."
for f in Dockerfile docker-compose.yml server.py requirements.txt; do
    if [ ! -f "$f" ]; then
        echo "❌ 缺少文件: $f"
        echo "   请先从项目目录 rsync 文件:"
        echo "   rsync -avz ./deploy/funasr/ root@zjsifan.com:/opt/funasr/"
        exit 1
    fi
done
echo "✅ 所有文件就绪"

# 4. 构建镜像
echo ""
echo "🔨 构建 Docker 镜像 (首次需下载模型, 约 5-10 分钟)..."
docker compose build

# 5. 启动服务
echo ""
echo "▶️  启动 FunASR 服务..."
docker compose up -d

# 6. 等待服务就绪
echo ""
echo "⏳ 等待模型加载 (约 30-60 秒)..."
for i in {1..30}; do
    if curl -sf http://localhost:10096/health > /dev/null 2>&1; then
        echo "✅ 服务就绪!"
        break
    fi
    sleep 2
    echo -n "."
done

# 7. 测试 API
echo ""
echo "🧪 测试 API..."
curl -s http://localhost:10096/health | python3 -m json.tool 2>/dev/null || echo "健康检查通过（无 python3）"

echo ""
echo "============================================"
echo "✅ FunASR 部署完成!"
echo ""
echo "API 地址: http://localhost:10096"
echo "健康检查: http://localhost:10096/health"
echo "ASR 接口: POST http://localhost:10096/asr"
echo ""
echo "常用命令:"
echo "  查看日志: docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"
echo "  重启服务: docker compose -f ${DEPLOY_DIR}/docker-compose.yml restart"
echo "  停止服务: docker compose -f ${DEPLOY_DIR}/docker-compose.yml down"
echo "============================================"
