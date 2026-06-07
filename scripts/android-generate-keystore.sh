#!/bin/bash
# Android 签名密钥生成脚本
# 首次发布时运行一次，生成后用 GitHub Secrets 保存

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$PROJECT_DIR/android/app"

KEYSTORE_PATH="$ANDROID_DIR/lingji-release.keystore"
PROPS_PATH="$ANDROID_DIR/keystore.properties"

echo "🔑 灵集 Android 签名密钥生成器"
echo ""

# 检查是否已存在
if [ -f "$KEYSTORE_PATH" ]; then
  echo "⚠️  密钥文件已存在: $KEYSTORE_PATH"
  read -p "是否覆盖？(y/N): " overwrite
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "已取消"
    exit 0
  fi
fi

# 读取密码
read -sp "请输入 Keystore 密码 (至少 6 位): " STORE_PASS
echo ""
read -sp "请再次输入 Keystore 密码: " STORE_PASS_CONFIRM
echo ""

if [ "$STORE_PASS" != "$STORE_PASS_CONFIRM" ]; then
  echo "❌ 两次密码不一致"
  exit 1
fi

read -sp "请输入密钥(Alias)密码 (可与上面相同): " KEY_PASS
echo ""

# 生成密钥
keytool -genkey -v \
  -keystore "$KEYSTORE_PATH" \
  -alias lingji \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=灵集 App, OU=Lingji, O=Lingji, L=Beijing, ST=Beijing, C=CN"

echo ""
echo "✅ 密钥已生成: $KEYSTORE_PATH"

# 生成 keystore.properties
cat > "$PROPS_PATH" << PROPS
storeFile=lingji-release.keystore
storePassword=$STORE_PASS
keyAlias=lingji
keyPassword=$KEY_PASS
PROPS

echo "✅ 配置文件已生成: $PROPS_PATH"

# 生成 GitHub Secrets 设置指引
echo ""
echo "=============================================="
echo "  GitHub Secrets 设置指引"
echo "=============================================="
echo ""
echo "以下 Secret 需要添加到 GitHub 仓库 (Settings → Secrets and variables → Actions):"
echo ""
echo "  ANDROID_KEYSTORE_FILE:"
echo "    运行并复制输出:"
echo "    base64 -i \"$KEYSTORE_PATH\" | pbcopy"
echo ""
echo "  ANDROID_KEYSTORE_PASSWORD: $STORE_PASS"
echo ""
echo "  ANDROID_KEY_ALIAS: lingji"
echo ""
echo "  ANDROID_KEY_PASSWORD: $KEY_PASS"
echo ""
echo "=============================================="
echo "⚠️  请勿将 keystore 文件或密码提交到 Git 仓库！"
echo "   android/app/ 下的 .keystore 和 .properties 已在 .gitignore 中排除"
