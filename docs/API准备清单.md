# 灵集 - API 准备清单

> 文档日期：2026-05-20

## 一、需要准备的 API 清单

### 1.1 文本 AI 服务

| API 名称 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|---------|------|--------|------|---------|------|
| DeepSeek API | 文本总结、归类、写作、去 AI 味生成 | P0 | ✅ 已准备 | [DeepSeek 开放平台](https://platform.deepseek.com/) | 建议先申请 API Key |
| OpenRouter API (备用) | 多模型接入，备选方案 | P2 | ✅ 已准备 | [OpenRouter](https://openrouter.ai/) | 如 DeepSeek 不稳定时使用，也用于热点抓取 |

### 1.2 多模态 AI 服务

| API 名称 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|---------|------|--------|------|---------|------|
| 豆包视觉理解 API | 图片理解、视频理解、OCR | P0 | ✅ 已准备 | [字节跳动火山引擎](https://www.volcengine.com/) | 用于上传图片/视频分析 |
| Seedance API - 生图 | AI 图片生成 | P0 | ✅ 已准备 | [字节跳动火山引擎](https://www.volcengine.com/) | 图文并茂配图，模型ID：ark-fd81bcbb-9cf8-4218-8069-8938bcf8aff4-4cb2d |
| Seedance API - 生视频 | AI 视频生成（每段15秒） | P0 | ✅ 已准备 | [字节跳动火山引擎](https://www.volcengine.com/) | 注意单段15秒限制，模型ID：ark-fd81bcbb-9cf8-4218-8069-8938bcf8aff4-4cb2d |
| video-use API | 视频剪辑合并 | P1 | ⏳ 待准备 | 待确认 | 多段视频合并 |

### 1.3 语音服务

| API 名称 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|---------|------|--------|------|---------|------|
| ElevenLabs API | 语音合成（TTS） | P2 | ✅ 已准备 | [ElevenLabs](https://elevenlabs.io/) | 高质量语音生成 |
| 浏览器原生 Web Speech API | 免费语音识别 | P1 | ✅ 无需准备 | 浏览器内置 | 免费用户使用 |

### 1.4 云服务

| API 名称 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|---------|------|--------|------|---------|------|
| Supabase Auth | 用户认证 | P0 | ✅ 已准备 | [Supabase](https://supabase.com/) | Auth + DB + Realtime |
| Supabase DB | 数据库 | P0 | ✅ 已准备 | [Supabase](https://supabase.com/) | PostgreSQL + pgvector |
| Supabase Storage | 媒体文件存储 | P0 | ✅ 已准备 | [Supabase](https://supabase.com/) | 替代阿里云 OSS，免费 50GB |
| 阿里云 CDN (可选) | 加速访问 | P3 | ⏳ 待准备 | [阿里云 CDN](https://www.aliyun.com/product/cdn) | 用户量增长后使用 |
| 阿里云 SMS | 短信验证码 | P1 | ✅ 已准备 | [阿里云短信服务](https://www.aliyun.com/product/sms) | 注册登录使用，签名：魔法超人，模板：SMS_506745050 |

### 1.5 支付服务

| API 名称 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|---------|------|--------|------|---------|------|
| 微信支付 | 微信支付 | P1 | ⏳ 待准备 | [微信支付商户平台](https://pay.weixin.qq.com/) | 国内用户支付 |

### 1.6 热点数据源

| 数据源 | 用途 | 优先级 | 状态 | 获取来源 | 备注 |
|--------|------|--------|------|---------|------|
| 微信公众号 RSS/API | 公众号内容抓取 | P1 | ⏳ 待准备 | 需自行开发/爬虫 | 第一阶段数据源 |
| 小红书 API/爬虫 | 小红书内容抓取 | P1 | ⏳ 待准备 | 需自行开发/爬虫 | 第一阶段数据源 |
| 抖音 API/爬虫 | 抖音内容抓取 | P2 | ⏳ 待准备 | 需自行开发/爬虫 | 第二阶段数据源 |
| B站 API/爬虫 | B站内容抓取 | P2 | ⏳ 待准备 | 需自行开发/爬虫 | 第二阶段数据源 |
| 微博 API/爬虫 | 微博内容抓取 | P2 | ⏳ 待准备 | 需自行开发/爬虫 | 第二阶段数据源 |
| 知乎 API/爬虫 | 知乎内容抓取 | P2 | ⏳ 待准备 | 需自行开发/爬虫 | 第二阶段数据源 |

---

## 二、API 获取快速链接索引

### AI 服务
- DeepSeek: https://platform.deepseek.com/
- 火山引擎（豆包）: https://www.volcengine.com/
- OpenRouter: https://openrouter.ai/
- ElevenLabs: https://elevenlabs.io/

### 云服务
- Supabase: https://supabase.com/
- 阿里云 OSS: https://www.aliyun.com/product/oss
- 阿里云 SMS: https://www.aliyun.com/product/sms
- 阿里云 CDN: https://www.aliyun.com/product/cdn

### 支付服务
- 微信支付: https://pay.weixin.qq.com/

---

## 三、API 准备优先级建议

### 第一阶段（必须准备）

1. **DeepSeek API** - 文本AI核心
2. **豆包视觉理解 API** - 多模态核心
3. **Seedance API（生图 + 生视频）** - 图片/视频生成
4. **Supabase** - 数据库和认证
5. **阿里云 OSS** - 文件存储

### 第二阶段（建议准备）

1. **video-use API** - 视频合并
3. **热点数据源API**（微信公众号 + 小红书）
4. **阿里云 SMS** - 短信验证码
5. **微信支付** - 支付功能

### 第三阶段（可选准备）

1. **其他热点数据源API**（抖音、B站、微博、知乎）
2. **阿里云 CDN** - 加速访问
3. **OpenRouter API** - 多模型备选

---

## 三、API Key 管理建议

### 安全要求

- ✅ 所有 API Key 存储在环境变量中，不提交到代码仓库
- ✅ 使用 `.env.example` 作为模板，不包含真实 Key
- ✅ API 调用通过 BFF 层（Next.js API Routes）转发，不暴露 Key 给前端
- ✅ 设置 API Key 的使用量监控和告警
- ✅ 定期轮换 API Key

### 环境变量配置

```env
# AI 服务
DEEPSEEK_API_KEY=
DOUBAO_API_KEY=
SEEDANCE_API_KEY=

# 云服务
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_REGION=

# 短信服务
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=

# 支付服务
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_KEY=
WECHAT_PAY_CERT_PATH=
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
```

---

## 五、开发前检查清单

- [x] DeepSeek API Key 申请完成 ✅
- [x] 豆包视觉理解 API Key 申请完成 ✅
- [x] Seedance API Key 申请完成 ✅
- [x] Supabase 项目创建完成 ✅（Auth + DB + Storage）
- [x] Supabase Storage 配置完成 ✅（替代阿里云 OSS）
- [x] 阿里云 SMS 服务开通完成 ✅
- [x] OpenRouter API Key 申请完成 ✅
- [x] ElevenLabs API Key 申请完成 ✅
- [ ] 热点数据源调研完成
- [x] 环境变量配置模板创建完成 ✅
- [ ] API 调用成本预估完成
- [ ] 用量监控和告警方案确定

---

## 六、API 成本预估（参考）

| 服务 | 每月预估用量 | 预估成本 | 说明 |
|------|------------|--------|------|
| DeepSeek API | 100M Token | ¥100 | 按 ¥0.001/千 Token |
| 豆包视觉理解 | 10,000 次 | ¥80 | 按 ¥0.008/次 |
| Seedance 生图 | 1,000 张 | ¥40 | 按 ¥0.04/张 |
| Seedance 生视频 | 500 段 | ¥250 | 按 ¥0.5/段 |
| Supabase Storage | 50GB | ¥0 | 免费额度内 |
| 阿里云 SMS | 1000 条 | ¥40 | 按 ¥0.04/条 |
| Supabase Pro | 1 个 | ¥180 | 按 $25/月估算 |
| **总计** | | **¥748** | |

> 注意：以上仅为初期预估，实际成本随用户量和使用情况变化
