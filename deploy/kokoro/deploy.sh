#!/bin/bash
# ============================================================
# Kokoro TTS 本地部署脚本 — 灵集 TTS 服务
# 在阿里云服务器上执行 (zjsifan.com)
# ============================================================
set -e

DEPLOY_DIR="/opt/kokoro"
echo "🎵 Kokoro TTS 本地部署"
echo "目标目录: ${DEPLOY_DIR}"

# 1. 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 2. 创建部署目录
mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"

# 3. 检查部署文件
echo ""
echo "📁 检查部署文件..."
for f in docker-compose.yml; do
    if [ ! -f "$f" ]; then
        echo "❌ 缺少文件: $f"
        echo "   请先从项目目录 rsync 文件:"
        echo "   rsync -avz ./deploy/kokoro/ root@zjsifan.com:/opt/kokoro/"
        exit 1
    fi
done
echo "✅ 所有文件就绪"

# 4. 拉取镜像
echo ""
echo "📥 拉取 Kokoro Docker 镜像..."
docker compose pull

# 5. 启动服务
echo ""
echo "▶️  启动 Kokoro TTS 服务..."
docker compose up -d

# 6. 等待服务就绪
echo ""
echo "⏳ 等待模型加载 (约 30 秒)..."
for i in {1..30}; do
    if curl -sf http://localhost:8880/health > /dev/null 2>&1; then
        echo "✅ 服务就绪!"
        break
    fi
    sleep 2
    echo -n "."
done

# 7. 测试 API
echo ""
echo "🧪 测试中文语音合成..."
curl -s -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"你好，我是灵集AI助手。","voice":"zf_xiaobei","speed":1.0}' \
  -o /tmp/kokoro_test.mp3

if [ -f /tmp/kokoro_test.mp3 ] && [ "$(stat -c%s /tmp/kokoro_test.mp3 2>/dev/null || stat -f%z /tmp/kokoro_test.mp3)" -gt 1000 ]; then
    echo "✅ 中文语音合成成功!"
    rm /tmp/kokoro_test.mp3
else
    echo "⚠️  测试音频文件过小，请检查日志"
fi

echo ""
echo "============================================"
echo "✅ Kokoro TTS 部署完成!"
echo ""
echo "API 地址: http://localhost:8880"
echo "Swagger:  http://localhost:8880/docs"
echo "Web UI:   http://localhost:8880/web"
echo "TTS 接口: POST http://localhost:8880/v1/audio/speech"
echo ""
echo "中文音色:"
echo "  女声: zf_xiaobei, zf_xiaoni, zf_xiaoxiao, zf_xiaoyi"
echo "  男声: zm_yunjian, zm_yunxi, zm_yunxia, zm_yunyang"
echo ""
echo "常用命令:"
echo "  查看日志: docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs -f"
echo "  重启服务: docker compose -f ${DEPLOY_DIR}/docker-compose.yml restart"
echo "  停止服务: docker compose -f ${DEPLOY_DIR}/docker-compose.yml down"
echo "============================================"
