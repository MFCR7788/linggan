# 灵集 — App Store Connect 隐私回答

> 在 App Store Connect → App Privacy 中逐项填写
> 填写语言：中文（App Store Connect 后台已支持中文界面）

---

## 一、数据收集（Data Types）

按以下表格逐项勾选"是"或"否"：

| 数据类型 | 收集？ | 链接到用户身份？ | 用于追踪？ | 用途 |
|---------|-------|----------------|-----------|------|
| 联系信息（手机号/邮箱） | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（账号注册与登录） |
| 用户内容（灵感笔记、AI 创作素材） | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（灵感库、创作中心） |
| 标识符（用户 ID、设备 ID） | ✅ 是 | ✅ 是 | ❌ 否 | App 功能（用户识别） |
| 使用数据（功能使用埋点） | ✅ 是 | ✅ 是 | ❌ 否 | 分析（产品改进） |
| 诊断（崩溃日志） | ❌ 否 | — | — | —（未集成崩溃 SDK） |
| 位置 | ❌ 否 | — | — | — |
| 健康与健身 | ❌ 否 | — | — | — |
| 财务信息 | ❌ 否 | — | — | — |
| 浏览历史 | ❌ 否 | — | — | — |
| 搜索历史 | ❌ 否 | — | — | — |

---

## 二、数据安全

| 问题 | 回答 |
|------|------|
| 数据是否加密传输？ | ✅ 是（HTTPS/TLS） |
| 数据是否加密存储？ | ✅ 是（Supabase 静态加密） |
| 用户能否请求删除数据？ | ✅ 是（App 内"注销账户"功能） |
| 数据存储地区 | 美国（Supabase）+ 中国（阿里云/火山引擎） |

---

## 三、第三方 SDK 披露

在 App Privacy → Third-Party SDK 中列出：

| 隐私清单类型 | SDK | 用途 |
|------------|-----|------|
| 未内嵌隐私清单 | @capacitor/core | 应用框架 |
| 未内嵌隐私清单 | @capacitor/camera | 相机访问 |
| 未内嵌隐私清单 | @capacitor/filesystem | 文件系统 |
| 未内嵌隐私清单 | @capacitor/preferences | 本地偏好存储 |
| 未内嵌隐私清单 | @capacitor/local-notifications | 本地通知 |
| 未内嵌隐私清单 | @capacitor/share | 系统分享 |
| 未内嵌隐私清单 | @supabase/supabase-js | 认证、数据库、存储 |

> 注意：Capacitor 8.x 插件已自带 `PrivacyInfo.xcprivacy`，以上 SDK 标记为"未内嵌隐私清单"是保守做法。提交审核时根据 App Store Connect 实际提示调整。

---

## 四、追踪（Tracking）

**App 不使用任何形式的用户追踪。**

- ❌ 不使用 IDFA
- ❌ 不接入广告 SDK
- ❌ 不做跨 App 用户追踪
- ❌ 不将用户数据分享给数据代理商

因此：
- "是否追踪用户" → **否**
- 不需要 `NSUserTrackingUsageDescription`
- 不需要 ATT 弹窗

---

## 五、AI 服务说明（不计入 SDK，但写入隐私政策）

以下 AI 服务通过 H5 后端 API 调用，**不直接打包到 iOS App**，不属于第三方 SDK 披露范围：

- DeepSeek（文本生成）
- 字节跳动火山引擎（豆包/Seedance/Seedream/TTS）
- 阿里云 DashScope（通义千问/Paraformer/CosyVoice）
- 阿里云 SMS（短信验证码）
- OpenRouter（多模型备用接入）
- ElevenLabs（语音合成备用）
- jina.ai（链接正文抓取）

这些服务已在隐私政策 `https://ai.zjsifan.com/privacy` 中披露。
