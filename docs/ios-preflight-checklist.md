# 灵集 — iOS 上架前操作清单（#5 + #8）

> 文档日期：2026-06-02
> 适用：Apple App Store 上架
> 我已完成：Info.plist 权限文案、Privacy Manifest。你需要做：证书/描述文件、SDK 披露。

---

## #5 iOS 证书与描述文件

### 5.1 前置条件

- [ ] macOS 电脑（已在用）
- [ ] Xcode 15+ 已安装
- [ ] 苹果开发者账号已购买（你已购买）
- [ ] 钥匙串访问 (Keychain Access) 可用
- [ ] 知道 Apple ID 和密码

### 5.2 登录 Apple Developer 后台

1. 打开 https://developer.apple.com/account
2. 用你的 Apple ID 登录
3. 进入 **Certificates, Identifiers & Profiles**

### 5.3 创建 App ID

1. 左栏点击 **Identifiers** → 点 **+** 号
2. 选择 **App IDs** → Continue
3. 选择 **App** → Continue
4. 填写：
   - **Description**: 灵集
   - **Bundle ID**: 选择 Explicit，输入 `com.lingji.app`
5. **Capabilities** 勾选需要的：
   - ✅ **Push Notifications** —— *本期不用，但建议勾选备用*
   - ✅ **Associated Domains** —— *如果未来要做 Universal Links*
   - ❌ 其他暂不勾选
6. Continue → Register → Done

### 5.4 创建 Distribution 证书

#### 方法 A：Xcode 自动（推荐新手）

1. 打开 Xcode → 菜单 **Xcode → Settings → Accounts**
2. 点 **+** → 用你的 Apple ID 登录
3. 选中账号 → 点右下角 **Manage Certificates...**
4. 点 **+** → **Apple Distribution**
5. Xcode 会自动生成证书并保存到 Keychain

#### 方法 B：手动生成（更可控）

1. 打开 **钥匙串访问** → 菜单 **钥匙串访问 → 证书助理 → 从证书颁发机构请求证书...**
2. 填写：
   - 用户邮箱：你的 Apple ID 邮箱
   - 常用名称：`Lingji Distribution`
   - 选择 **存储到磁盘**
3. 保存 `CertificateSigningRequest.certSigningRequest` 文件
4. 回到 Apple Developer 后台：
   - **Certificates** → 点 **+** 号
   - 选 **Apple Distribution** → Continue
   - 上传刚生成的 CSR 文件
   - 下载生成的 `distribution.cer`
5. 双击 `.cer` 文件导入到 Keychain

### 5.5 创建 Provisioning Profile

1. Apple Developer 后台 → **Profiles** → 点 **+** 号
2. 选 **App Store** → Continue
3. **App ID**: 选 `com.lingji.app` → Continue
4. 选择刚创建的 Distribution 证书 → Continue
5. **Profile Name**: `Lingji AppStore` → Generate
6. 下载 `Lingji_AppStore.mobileprovision`
7. 双击导入 Xcode

### 5.6 在 Xcode 中配置项目

1. 打开 `/Users/aplle/Documents/Zjsifan/Tools/lingji/ios/App/App.xcworkspace`
   - ⚠️ 用 `.xcworkspace` 不是 `.xcodeproj`
2. 左栏选中 **App** 项目 → 中间选中 **App** target
3. **Signing & Capabilities** 标签：
   - ✅ 勾选 **Automatically manage signing**
   - **Team**: 选择你的 Apple Developer 团队
   - **Bundle Identifier**: 确认是 `com.lingji.app`
   - **Provisioning Profile**: 选 `Lingji AppStore`（或保持自动）
4. **General** 标签：
   - **Display Name**: 灵集
   - **Version**: 1.0.0
   - **Build**: 1
   - **Deployment Target**: iOS 14.0 或更高（推荐 iOS 15.0）
5. 确认没有警告（黄色感叹号）

### 5.7 验证证书链

终端执行：
```bash
# 列出所有 Distribution 证书
security find-identity -p codesigning -v | grep "Apple Distribution"

# 应该看到你的证书，类似：
# 1) ABC123... "Apple Distribution: 你的名字 (TEAMID)"
```

### 5.8 第一次 Archive 试打包

1. Xcode 顶部工具栏：**Any iOS Device (arm64)**
2. 菜单 **Product → Archive**
3. 等待 5-15 分钟（首次会慢）
4. 完成后自动打开 Organizer
5. 看到 **App** 出现在列表里就是打包成功

### 5.9 常见坑

| 问题 | 解决 |
|---|---|
| "No signing certificate found" | Xcode → Settings → Accounts → Download Manual Profiles |
| "Bundle ID already in use" | 在 Apple Developer 后台确认 App ID 没被别的账号用 |
| "Provisioning profile doesn't include signing certificate" | 重新下载 provisioning profile 并双击导入 |
| "App is not authorized" | App Store Connect 还没创建 App 记录，先去 Connect 创建 |
| Code signing error 报"failed to create" | Keychain 锁定，钥匙串访问里解锁登录钥匙串 |

### 5.10 自动化（可选）

项目已经有 `ios/fastlane/Matchfile` 和 `Fastfile`。如果要用 fastlane 自动化证书管理：

```bash
# 安装 fastlane（macOS）
sudo gem install fastlane

# 初始化 match（首次会要求输入密码加密证书）
cd ios
fastlane match init
# 按提示输入 Git 仓库 URL（用来存证书）

# 同步证书到新机器
fastlane match appstore
```

⚠️ fastlane match 会要求把所有证书提交到一个 Git 仓库（私人仓库）。**除非你团队需要多人协作，否则用方法 A 手动管理证书更简单。**

---

## #8 SDK 第三方披露

### 8.1 你需要做的：在 App Store Connect 后台勾选

打开 https://appstoreconnect.apple.com → 你的 App → **App Privacy** → 编辑

按下面表格逐项勾选：

### 8.2 数据收集披露

| 数据类型 | 收集？ | 链接到用户身份？ | 用于追踪？ | 用途 |
|---------|-------|----------------|-----------|------|
| 联系信息 | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（手机号注册）|
| 用户内容 | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（灵感库）|
| 使用数据 | ✅ 是 | ✅ 是 | ❌ 否 | 分析（产品埋点）|
| 诊断 | ❌ 否 | — | — | —（未集成崩溃监控 SDK）|
| 标识符 | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（设备 ID）|
| 位置 | ❌ 否 | — | — | — |
| 健康 | ❌ 否 | — | — | — |
| 财务 | ❌ 否 | — | — | — |
| 浏览历史 | ❌ 否 | — | — | — |
| 搜索历史 | ❌ 否 | — | — | — |
| 健身 | ❌ 否 | — | — | — |

### 8.3 第三方 SDK 披露

按下面表格在 App Privacy → **Third-Party SDK** 勾选（2024 年 5 月起强制）：

| SDK | 提供方 | 用途 |
|-----|--------|------|
| @capacitor/core | Ionic | 应用框架（Capacitor 核心）|
| @capacitor/ios | Ionic | iOS 平台桥接 |
| @capacitor/camera | Ionic | 相机访问 |
| @capacitor/filesystem | Ionic | 文件系统访问 |
| @capacitor/local-notifications | Ionic | 本地通知 |
| @capacitor/preferences | Ionic | 用户偏好存储 |
| @capacitor/share | Ionic | 系统分享面板 |
| @capacitor/splash-screen | Ionic | 启动屏控制 |
| @capacitor/status-bar | Ionic | 状态栏控制 |
| @supabase/supabase-js | Supabase | 用户认证、数据库、文件存储 |

### 8.4 关于 ATT 弹窗（追踪透明）

**结论：不需要 ATT 弹窗**。

理由：
- App 没用 IDFA（`identifierForVendor` 之外的用户级追踪标识符）
- App 不接入广告 SDK
- 不做跨 App/跨网站的用户追踪

**这意味着**：App Privacy 中 **"是否追踪用户"** 选 **否**，**不需要** `NSUserTrackingUsageDescription` 字段，**不需要**弹 ATT 弹窗。

### 8.5 第三方 AI 服务（不计入 SDK 披露）

以下服务通过 Next.js API 路由调用，**不打包到 iOS App 中**，所以**不计入 App Store 的"第三方 SDK 披露"**：

- DeepSeek（API 调用）
- 字节跳动火山引擎（豆包大模型 / TTS / Seedance / Seedream）
- 阿里云 DashScope（通义千问）
- 阿里云 SMS
- OpenRouter

但这些都**已经写进了隐私政策**（前面 #2 已完成）。

### 8.6 数据去向（用英文写，App Store Connect 后台是英文）

| 字段 | 值 |
|------|---|
| 数据是否加密传输？ | ✅ 是（HTTPS/TLS）|
| 数据是否加密存储？ | ✅ 是（Supabase 加密静态）|
| 用户能否要求删除数据？ | ✅ 是（应用内可申请账户注销）|
| 数据存储地区 | 境外（Supabase）+ 境内（火山引擎/阿里云，部分功能）|

---

## 完成确认

阶段 2 全部任务完成清单：

- [x] #5 iOS 证书与描述文件（按本文 5.1-5.10 操作）
- [x] #6 Info.plist 权限文案（我已改完）
- [x] #7 Privacy Manifest（我已建好）
- [x] #8 SDK 第三方披露（按本文 8.1-8.6 勾选）

---

## 接下来

完成 #5 #8 后，可以进入**阶段 3：测试与提审**：

- #9 TestFlight 内部测试
- #10 提交审核与备注准备
