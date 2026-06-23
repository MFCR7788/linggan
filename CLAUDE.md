# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

灵集 LingJi — AI 灵感收集 + 热点监控 + 内容创作工具，面向中文创作者。阿里云 ECS 部署 H5，Capacitor 8 套壳为 iOS/Android 原生应用。

## 回复规范

回复结尾如果存在需要用户手动操作的事项，用 Markdown 勾选清单列出：

```markdown
- [ ] 待办一
- [ ] 待办二
```

用户完成后，用一句话做进度回顾（不需要展开分析，不需要重新列出已完成项）。

## 常用命令

```bash
pnpm dev          # 开发服务器 (next dev, localhost:3000)
pnpm build        # 生产构建 (next build)
pnpm lint         # ESLint 检查 (next lint, extends next/core-web-vitals)
pnpm test         # 运行所有 vitest 测试 (jsdom 环境)
pnpm test:watch   # vitest 监听模式
npx cap sync      # 同步 H5 改动到 Capacitor 原生项目
```

运行单个测试：`npx vitest run src/test/<file>.test.ts`。vitest 配置了 `globals: true`，测试文件中 `describe`/`it`/`expect`/`vi` 无需 import。`@` 别名映射到 `./src`（`vitest.config.ts` 和 `tsconfig.json` 均已配置）。

**Playwright E2E 测试**：`.claude/test-settings.mjs` 包含完整的 Playwright E2E 测试脚本，使用 Chromium + dev auth 注入，可测试 profile/settings 等受保护页面。手动运行该脚本需要先启动 `pnpm dev`，然后 `node .claude/test-settings.mjs`。

## 技术栈

- **前端**: Next.js 14 (App Router) + React 18 + TypeScript + TailwindCSS 3.4
- **后端**: Next.js API Routes + Supabase (Postgres, Auth, Storage)
- **AI 服务**: 阿里云 DashScope (DeepSeek, Qwen, Wan, CosyVoice) + 火山引擎豆包 + OpenRouter + HeyGen + ElevenLabs + jina.ai Reader + Agnes AI
- **移动端**: Capacitor 8，WebView 加载生产 URL (`https://zjsifan.com`)
- **部署**: 阿里云 ECS (前端 + API + FunASR/Kokoro) + pm2
- **测试**: Vitest + jsdom + @testing-library/react，Playwright 用于 E2E
- **CI/CD**: GitHub Actions (移动端发布到 TestFlight/Play Store, 服务端部署到阿里云, 热点清理)
- **包管理器**: 本地开发用 pnpm（有 `pnpm-lock.yaml`），GitHub Actions 用 npm（有 `package-lock.json`），两个 lockfile 需保持同步
- **模块系统**: ESM (`"type": "module"`)，CommonJS 配置文件使用 `.cjs` 扩展名 (`postcss.config.cjs`)

## 项目结构

```
src/
├── middleware.ts          # 认证守卫 + API 频率限制，拦截所有页面路由 (protectedPaths)
├── app/
│   ├── layout.tsx         # 根布局：渐变背景 + StarBackground + mobile-first (max-w-[448px])
│   ├── page.tsx           # "/" → redirect /login
│   ├── globals.css        # 全局样式 + iOS safe-area CSS 变量
│   ├── api/               # 60+ API 路由 (ai/, auth/, credits/, hotspot/, jobs/, platforms/, etc.)
│   └── <route>/page.tsx   # App Router 页面
├── lib/
│   ├── api-handler.ts     # withAuth / withHandler 包装器，消除 API 样板代码
│   ├── api-client.ts      # 前端 ApiClient 单例 (get/post/put/delete/patch)
│   ├── api-utils.ts       # createApiResponse / createApiError 统一响应格式
│   ├── supabase.ts        # 浏览器端 Supabase 客户端
│   ├── supabase-server.ts # 服务端客户端 (createClient, createAdminClient, createPgPool)
│   ├── runtime-config.ts  # 运行时从 .env.local 文件系统读取 (绕过 Next.js build 时内联)
│   ├── dev-auth.ts        # 开发模式认证 (localStorage → cookie 桥接)
│   ├── credits.ts         # 点数系统 (原子 CAS 扣点, RPC 降级, 退款流水)
│   ├── credit-costs.ts    # 各功能扣点单价配置 (改价走 git review)
│   ├── rate-limiter.ts    # 内存频率限制器 (登录 10次/分, 短信 5次/分, AI 30次/分, 默认 60次/分)
│   ├── ai-services.ts     # 旧 AI 调用入口 (逐步迁移到 ai/ 子模块)
│   ├── ai/                # AI 子模块 (chat, vision, image, video, tts, digital-human, seedance, agnes-video, avatar, content, storyboard, smart-clip-*, mashup-engine, hyperframes, weather, usage, cover-generator, funasr-client)
│   ├── providers/         # AI 模型提供商 (dashscope, seedance/volcengine, agnes, deepseek, openrouter — registry, model-router, cost-matrix)
│   ├── jobs/              # AI 任务队列 (queue, task-worker, hotspot-checker + workers/)
│   ├── platforms/         # 多平台集成 (微信公众号/微博 OAuth, 加密存储, 发布)
│   ├── agent/             # 对话 Agent 引擎 (conversational loop, SSE streaming, tool calling)
│   ├── assistant/         # AI 创作助手 (RAG pipeline, memory/知识库, intent 检测, context compressor)
│   ├── mcp/               # MCP 客户端 (Model Context Protocol — client, config, defaults, manager)
│   ├── hyperframes/       # 视频关键帧 prompt 生成
│   ├── search/            # 联网搜索聚合器 (百度/点评 + Google/Bing)
│   ├── upload/            # 上传 (客户端压缩, 校验, 配额)
│   ├── captcha/           # 验证码 (SVG + 文字点选)
│   ├── storage/           # Supabase Storage 清理
│   ├── analysis/          # 热点分析器
│   ├── extract/           # 文档提取 (pdf-parse, mammoth)
│   ├── video-models.ts    # AI 视频模型定义与参数
│   ├── video-transcriber.ts  # 视频转文字/字幕提取
│   ├── bgm-recommender.ts # 背景音乐智能推荐
│   ├── ffmpeg-utils.ts    # FFmpeg 视频处理工具
│   ├── revideo-render.ts       # Revideo HTTP 渲染客户端 (调用 42 ECS)
│   ├── revideo-local-render.ts # Revideo 本地渲染 (仅 42 加载, MIT 许可)
│   ├── remotion-render.ts      # Remotion HTTP 渲染客户端 (调用 42 ECS)
│   ├── remotion-local-render.ts # Remotion 本地渲染 (仅 42 加载, 商业许可)
│   ├── notification-service.ts  # 站内通知服务
│   ├── wechat-pay.ts      # 微信支付集成
│   ├── account-presets.ts # 预设账号配置
│   ├── preset-keywords.ts # AI 创作预设关键词
│   ├── preset-templates.ts # AI 创作预设模板
│   ├── text-utils.ts      # 文本处理工具
│   ├── logger.ts           # 结构化 JSON 日志 (生产环境仅 warn/error)
│   ├── migrate.ts         # 数据库迁移辅助
│   ├── handoff-url.ts     # 跨页面内容流转 (URL query 传参)
│   └── style-constants.ts # 共享样式常量 (emoji, 平台色, 路由映射, 视频风格预设)
├── components/
│   ├── ui/               # 基础 UI 组件 (Button, Card, Input)
│   ├── workflow/         # 工作流引擎 (StepWidgetRegistry + 10 个 StepWidget)
│   ├── agent/            # Agent 对话 UI (AgentChatView, AgentMessage, ThinkingIndicator, ChoiceCards, etc.)
│   ├── BottomNav.tsx     # 底部导航栏 (5 tabs: 首页/灵感库/+/AI创作/我的，+ 为快速采集)
│   ├── TopNav.tsx        # 顶部导航栏
│   ├── Toast.tsx         # Toast 通知 (provider 模式)
│   ├── GlassCard.tsx     # 毛玻璃卡片
│   ├── ErrorBoundary.tsx # React 错误边界
│   ├── InsufficientCreditsModal.tsx  # 点数不足弹窗 (监听 credits:insufficient 事件)
│   ├── CreditsWarningBanner.tsx      # 点数不足横幅 (监听 credits:updated 事件)
│   └── ...               # 其他共享组件 (PrimaryButton, StarBackground 等)
├── hooks/                # 自定义 React hooks (use-navigate, use-user, use-inspiration, use-workflow-session 等 + ai/ 子目录)
├── providers/            # React context providers (ReactQuery, Toast)
├── types/                # TypeScript 类型 (index.ts 业务类型 + supabase.ts 数据库类型)
├── revideo/              # Revideo 渲染引擎 (scenes/, server.ts, render pipeline, MIT 许可, 无水印)
├── remotion/             # Remotion 渲染引擎 (compositions/, Root.tsx, server.ts, 商业许可)
├── scripts/              # 辅助脚本 (数据库迁移等)
└── test/                 # 测试文件 (含 agent/, assistant/, context/, memory/, mcp/, hooks/, providers/ 子目录) + setup.ts
supabase/migrations/      # 17 个 SQL 迁移文件 (按序号 002-018)
docs/                     # 需求文档、开发规划、API 清单
scripts/                  # 运维脚本 (部署, 截图, 点数发放, cron 检查, logrotate)
deploy/                   # 自部署 AI 服务 (Kokoro TTS, FunASR 语音识别)
```

## 关键架构约定

### API 路由模式

所有需认证的 API 使用 `withAuth`，公开路由使用 `withHandler`：

```typescript
// src/app/api/xxx/route.ts
export const GET = withAuth(async ({ request, user, params }) => {
  return createApiResponse(data);
});
```

`withAuth` 自动处理认证 + try-catch，`user` 一定非空。响应通过 `createApiResponse` / `createApiError` 统一为 `ApiResponse<T>` 格式 (`{ success, data, error, code }`)。

### API 频率限制

Middleware 对所有 `/api/` 路由实施基于 IP 的内存频率限制（`src/lib/rate-limiter.ts`）：

| 路由前缀 | 限制 |
|----------|------|
| `/api/auth` | 10 次/分钟 |
| `/api/sms` | 5 次/分钟 |
| `/api/ai` | 30 次/分钟 |
| 其他 API | 60 次/分钟 |

超限返回 429 + `Retry-After` 头。当前为单实例内存实现，需跨实例共享时替换为 Redis。

### 点数系统

- `src/lib/credits.ts` — 所有点数操作唯一入口，禁止直接操作 `user_credits` 表
- `consume(userId, amount, source, description)` → 余额不足抛 `InsufficientCreditsError`
- `grant(userId, amount, type, source, description)` / `refund(userId, amount, source, description)`
- 单价在 `src/lib/credit-costs.ts` (不在数据库，改价需 git review)
- 原子扣点优先用 PostgreSQL RPC (`consume_credits_atomic`)，降级用 CAS 模式

### 认证

- 生产：Supabase Auth (`getCurrentUser` in `supabase-server.ts`)
- 开发：通过 `src/lib/dev-auth.ts` 实现 localStorage → cookie 桥接
  - 前端设置 `localStorage.dev_user` 对象 (`{ id: "..." }`)
  - `syncDevAuthCookie()` 自动同步到 `dev_user_id` cookie
  - Middleware 验证 `dev_auth_secret` cookie（需与 `DEV_AUTH_SECRET` 匹配）后才信任 `dev_user_id`
  - `ENABLE_DEV_AUTH` 设为 `false` 可在开发构建中强制禁用 dev auth
  - **不再信任 `x-forwarded-for` / `x-real-ip` 头**来判定 localhost，仅靠 secret cookie 保护
- **生产部署前必须删除** `middleware.ts` 和 `supabase-server.ts` 中的 dev auth 快捷路径
- `AUTH_SALT` 首次上线后不可变更 (用于手机号登录的 deterministic password)
- Middleware 有 GoTrue 降级机制：Supabase Auth 故障时回退检查 `lingji_auth_user_id` cookie (由 `lingji_auth` API 设置)，保证可用性

### 受保护的路由

Middleware 的 `protectedPaths` 数组定义了需要认证的页面路由：

```
/home, /ai, /capture, /agent, /hotspot, /inspiration, /schedule,
/notification, /profile, /publish, /insights, /workflow
```

新增受保护页面时需在此数组添加路径前缀。

### 环境变量

- `.env.local` 中的敏感配置通过 `src/lib/runtime-config.ts` 运行时从文件系统读取，不依赖 Next.js build 时内联
- 读取 API key 用 `getDashScopeApiKey()` 等专有函数，不用 `process.env` 直接访问
- `CRON_SECRET` 用于保护 cron 调用的端点 (`/api/jobs/claim`, `/api/platforms/metrics-fetch`)

> **注意**: Middleware 中 Supabase 客户端使用 `process.env.SUPABASE_ANON_KEY`（无 `NEXT_PUBLIC_` 前缀），但 `.env.example` 中定义为 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。`.env.local` 中两个变量名均需设置。

**近期新增的环境变量**：

| 变量 | 用途 |
|------|------|
| `AGNES_API_KEY` | Agnes AI 全模态 API（OpenAI 兼容，免费） |
| `PEXELS_API_KEY` | Pexels 素材搜索（200 请求/小时免费） |
| `PIXABAY_API_KEY` | Pixabay 素材搜索（100 请求/分钟免费） |
| `UNSPLASH_ACCESS_KEY` | Unsplash 素材搜索（50 请求/小时免费） |
| `REVIDEO_RENDER_URL` / `REVIDEO_SECRET` | Revideo 渲染服务（42 ECS，MIT 许可） |
| `REMOTION_RENDER_URL` / `REMOTION_SECRET` | Remotion 渲染服务（42 ECS，商业许可） |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub MCP Server |
| `MCP_SERVERS` | MCP 服务器 JSON 配置（覆盖默认值） |

### 安全头信息（`next.config.mjs`）

`next.config.mjs` 通过 `headers()` 对所有路由强制实施安全策略。**新增外部脚本/图片/帧/连接源时，必须同步更新 CSP**，否则功能会静默失败：

- **Content-Security-Policy**:
  - `script-src`: `'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com`
  - `style-src`: `'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `img-src`: `'self' data: blob: https: http:`
  - `font-src`: `'self' https://fonts.gstatic.com`
  - `connect-src`: `'self' https: wss:`
  - `media-src`: `'self' blob: https:`
  - `frame-src`: `'self' https://www.youtube.com https://player.bilibili.com`
  - `worker-src`: `'self' blob:`
- **X-Frame-Options**: `DENY`
- **X-Content-Type-Options**: `nosniff`
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: `camera=(), microphone=(self), geolocation=()`

其他关键配置：`serverActions.bodySizeLimit: '30mb'`，`serverComponentsExternalPackages: ['pdf-parse', 'better-sqlite3']`。

### 前端事件系统

`ApiClient` (src/lib/api-client.ts) 在 API 响应中自动派发 DOM 事件，驱动全局 UI 反馈：

- `credits:insufficient` → `InsufficientCreditsModal` 弹出充值引导
- `credits:updated` → `CreditsWarningBanner` 实时更新点数余额

组件通过 `window.addEventListener` 监听这些事件，无需 props drilling。

### 移动端适配

- 主容器 `max-w-[448px]`，桌面端居中，两侧露出星空背景
- iOS safe area: `env(safe-area-inset-*)` 在 layout.tsx 的 main 元素上
- `capacitor-preview/` 是构建产物目录（已 gitignore），作为 Capacitor 的 `webDir`。修改 H5 后运行 `npx cap sync` 将其同步到原生项目
- 原生端本地持久化用 `@capacitor/preferences`
- `capacitor.config.ts` 中 `server.url` 指向 `http://localhost:3000`（仅开发用），生产环境 Capacitor 加载 `https://zjsifan.com`

### TailwindCSS 主题

`tailwind.config.js` 自定义主题色（`darkMode: "class"`）：

| Token | 值 | 用途 |
|-------|-----|------|
| `primary` | `#3B82F6` | 主色调 (blue-500) |
| `background` | `#0A1629` | 深色背景 (深蓝黑) |
| `surface` | `rgba(255,255,255,0.12)` | 毛玻璃卡片表面 |
| `border` | `rgba(255,255,255,0.3)` | 半透明边框 |
| `muted-foreground` | `#9CA3AF` | 次要文本色 |

毛玻璃 UI 样式常量在 `src/lib/style-constants.ts` 中定义了 `BG_GLASS`、`BORDER_GLASS` 等共享值。

### AI 任务队列 (V2.0.1)

`src/lib/jobs/queue.ts` 基于 `ai_tasks` 表的异步任务队列：
- `enqueueBatch` 批量提交 → worker `claimNext` 抢占 → 更新进度 → 标记完成/失败
- 失败自动重试 (指数退避: 30s → 2min → 8min)
- `/api/jobs/claim` 由 ECS crontab 定时触发
- 并发限制按任务类型 (如 `digital_human: 3`, `video: 5`)
- 任务有 `priority` (1-10)、`estimated_seconds`、进度百分比

### 工作流引擎 (V2.0.3)

`src/components/workflow/StepWidgetRegistry.tsx` — 多步骤 AI 创作流程：
- 10 个 StepWidget 按 `LingjiEntry` 路由注册 (灵感→文案→生图→图片编辑→TTS→视频→数字人→广告→热点→发布)
- `WorkflowSession` 记录当前步骤、进度、handoff 数据
- 内容跨步骤流转通过 `handoff` (Record<string, string>) 和 URL query params (`buildHandoffUrl`)
- API: `/api/workflow/sessions/`

### 对话 Agent (`src/lib/agent/`)

全自主对话 Agent 引擎，支持多轮工具调用循环：
- `loop.ts` — Agent 主循环 (think → act → observe → repeat)，支持 maxSteps 和超时
- `stream.ts` — SSE 流式输出到前端，实时展示思考/工具调用/回复
- `sse-client.ts` — 前端 SSE 消费端，支持 abort 和重连
- `tools/` — 可注册的工具函数 (搜索、读取灵感、查询热点、生成视频模板等)
- API 入口: `/api/ai/agent/chat/`

### AI 创作助手 (`src/lib/assistant/`)

RAG 增强的 AI 创作助手 pipeline：
- `pipeline.ts` — 主 pipeline 编排 (context retrieval → intent detection → generation)
- `intent.ts` — 用户意图分类（创作/查询/分析/闲聊）
- `context/` — 上下文构建器（用户 profile、灵感库、最近作品）
- `memory/` — 对话记忆管理（短期摘要 + 长期向量记忆）
- `knowledge/` — 知识库检索（向量搜索 + RRF 融合）
- `skills/` — 可注册的技能模块
- `context-compressor.ts` — 上下文压缩，控制 token 成本
- `embedding.ts` — embedding 生成（本地或 API）
- API 入口: `/api/assistant/*`

### MCP 客户端 (`src/lib/mcp/`)

Model Context Protocol 客户端集成，用于连接外部 MCP 服务器（如 GitHub）：
- `client.ts` — MCP 客户端连接与通信
- `config.ts` — 服务器配置解析
- `defaults.ts` — 预置 MCP 服务器配置
- `manager.ts` — 连接生命周期管理
- MCP 服务器通过 `MCP_SERVERS` 环境变量或 `GITHUB_PERSONAL_ACCESS_TOKEN` 配置

### 视频生成体系

LingJi 的视频生成是跨模块的核心功能，涉及 5 个 AI 模型提供商、3 条渲染管线、2 个智能剪辑引擎。

#### 视频模型注册表 (`src/lib/video-models.ts`)

定义三档质量级别，每档含 T2V（文生视频）和 I2V（图生视频）配置：

| 级别 | 模型 | 分辨率 | 最长 | 价格 |
|------|------|--------|------|------|
| `fast`（推荐） | DashScope Wan 2.6 | 720P, 1280×720 | 5s | ¥0.6/s |
| `standard` | DashScope Wan 2.6 | 1080P, 1920×1080 | 10s | ¥1.0/s |
| `premium` | DashScope Wan 2.6 | 1080P, 1920×1080 | 15s | ¥1.5/s |

`QUALITY_TIERS` 是 Proxy 惰性加载对象，通过 `getQualityTiers()` 动态生成。新增模型或调整价格时修改此文件。

#### AI 视频生成引擎 (`src/lib/ai/video.ts`)

核心编排器，整合三大提供商：

**DashScope（阿里云百炼）**：
- `submitVideoTask()` — HappyHorse 1.0 T2V：文生视频，5s 720P，异步任务模式（提交 → 轮询 taskId）
- `submitI2VTask()` — HappyHorse 1.0 I2V：图生视频（首帧 → 视频），`first_frame` / `last_frame` 双帧控制
- `submitVideoGenerationTask()` — 通用入口，按 quality tier 自动选择 Wan 2.6 模型和参数（支持多图 I2V）

**Seedance 2.0（火山引擎 Ark）** — `src/lib/ai/seedance.ts`：
- `submitSeedanceTask()` — 提交视频生成任务，支持 T2V、I2V（首帧 + reference_image 双角色防止画面漂移）、首尾帧控制
- `getSeedanceTaskStatus()` / `pollSeedanceTask()` — 轮询 + 超时（8 分钟）
- 模型：`doubao-seedance-2-0-260128`（标准）/ `doubao-seedance-2-0-fast-260128`（快速）
- 支持分辨率 480p/720p/1080p，比例 16:9/9:16/1:1 等 7 种

**Agnes AI Video** — `src/lib/ai/agnes-video.ts`：
- `submitAgnesVideoTask()` — OpenAI 兼容 API，免费全模态，最长 20s
- 模型 `agnes-video-v2.0`，支持 I2V（`image_url` 参数）

所有提供商共享异步模式：提交 → 返回 taskId → 轮询查询 → 获取 videoUrl。轮询逻辑在各 provider 文件中实现，API 路由负责调度。

#### 分镜生成 (`src/lib/ai/storyboard.ts`)

将脚本文本拆分为分镜序列，供视频生成管道逐段渲染：

- `generateStoryboard(scriptText, duration)` — 基础版：按时长自动分段，DeepSeek 生成每段的 visualPrompt（英文画面描述）+ subtitle（中文字幕）+ transition
- `generateStoryboardV2({ inspirations, stylePreset, duration, ... })` — 增强版：融入灵感素材上下文、风格预设、语言偏好、首帧参考图
- `calcSegmentDurations()` — 按 ~10s/段 自动计算分段时长
- 降级策略：LLM 解析失败时按时间段均匀切分

#### 智能剪辑引擎 (`src/lib/ai/smart-clip-engine.ts`)

完整剪辑流水线（4 步），支持两种方向：

| 方向 | 模式 | 说明 |
|------|------|------|
| **clip**（剪辑） | `auto` / `silence_only` / `by_description` / `by_time_ranges` | 自动检测静音+口水词+重复并删除；或按自然语言描述剪辑；或按精确时间范围 |
| **slice**（切片） | `product` / `highlight` / `topic` / `uniform` / `custom` | 按产品讲解/高能时刻/话题切换/均分/关键词 切分为多段短视频 |

流水线步骤：
1. `extractAudio()` — FFmpeg 提取 WAV 音频（16kHz mono）
2. `transcribe()` — FunASR 语音转文字 → 带时间戳的句子
3. 分析阶段：`analyzeForClip()` — 静音检测 + 口水词检测 + 重复检测 + LLM 分析 → 合并分段方案；`analyzeForSlice()` — 按模式生成切片点
4. `executeClip()` / `executeSlice()` — FFmpeg trim+concat 执行，支持后处理

子模块：
- `src/lib/ai/smart-clip-analysis.ts` — detectSilence, detectFillers, detectRepetition, mergeAnalyses
- `src/lib/ai/smart-clip-plan.ts` — analyzeClipByDescription, analyzeSliceByProduct, analyzeSliceByTopic（LLM 驱动）
- `src/lib/ai/smart-clip-executor.ts` — trimAndConcat, extractSlices, applyPostProcess（FFmpeg）
- `src/lib/ai/smart-clip-progress.ts` — 进度跟踪回调类型

#### AI 混剪引擎 (`src/lib/ai/mashup-engine.ts`)

多素材智能编排 + FFmpeg 合成流水线：

1. `analyzeClips()` — 下载多段视频 → ffprobe 分析（时长/分辨率/有无音频）
2. `generateArrangement()` — DeepSeek LLM 编排：决定每段取多长、裁剪起点、转场类型（hard/fade/slide/zoom）、BGM 风格
3. `compositeMashup()` — FFmpeg 合成：逐段裁剪缩放 → 统一分辨率（默认 9:16 1080×1920）→ concat+xfade 衔接 → BGM 混音（fade in/out + amix）
4. `runMashupPipeline()` — 一键全流程

BGM 文件位于 `public/bgm/`（tech.mp3, chill.mp3, hype.mp3 等），`BGM_FILES` 映射风格到文件。

#### 数字人 (`src/lib/ai/digital-human.ts`)

基于 DashScope 百炼的数字人视频能力：

- `submitDigitalHumanTask()` — Audio2Video（wan2.2-s2v）：静态图 + 音频 → 口型同步视频
- `submitAnimateTask()` — 动作迁移（wan2.2-animate）：静态角色图 + 参考视频 → 角色复刻动作/表情。支持 `animate`（动作迁移）和 `replace`（角色替换）模式
- `getDigitalHumanTaskStatus()` / `getAnimateTaskStatus()` — 异步轮询

数字人任务通过作业队列处理（`src/lib/jobs/workers/digital-human.ts`），并发限制 3。

#### 视频渲染管线

两套独立的模板渲染引擎，部署在 42 ECS（高配），由 101 服务器通过 HTTP 远程调用：

| 引擎 | 目录 | 许可 | 无水印 | 端口 |
|------|------|------|--------|------|
| Revideo | `src/revideo/` | MIT | 是 | 3101 |
| Remotion | `src/remotion/` | 商业 | 否 | 3100 |

**渲染客户端**（运行在 101）：
- `src/lib/revideo-render.ts` → `renderRevideoRemote()` — HTTP POST 到 42:3101/render
- `src/lib/remotion-render.ts` → `renderRemotionRemote()` — HTTP POST 到 42:3100/render
- 返回统一 `RenderResult`（url, storagePath, renderId, 尺寸/帧数）

**渲染服务端**（运行在 42）：
- `src/revideo/server.ts` — 独立 HTTP server，`POST /render`，`REVIDEO_SECRET` 鉴权，CORS 白名单 `zjsifan.com`
- `src/remotion/server.ts` — 同上模式，CORS 宽松 `*`
- 渲染结果上传到 Supabase Storage `lingji-media` bucket

**本地渲染**（仅 42 加载，101 通过 tsconfig exclude 跳过以省 Chromium 依赖）：
- `src/lib/revideo-local-render.ts` — Puppeteer + `@revideo/renderer`，输出 1920×1080 MP4
- `src/lib/remotion-local-render.ts` — Remotion renderer 本地实现

**模板/场景**：
- Remotion: `src/remotion/compositions/TikTokShort.tsx`（竖屏短视频）、`TitleIntro.tsx`（标题开场）
- Revideo: `src/revideo/scenes/title-intro.tsx`（标题开场）、`minimal.tsx`

#### TTS 语音合成（视频配音）

`src/lib/ai/tts/` — 多提供商 TTS 引擎，为视频提供画外音：
- `registry.ts` — 引擎注册表（按优先级 fallback）
- `providers/cosyvoice-cloud.ts` — DashScope CosyVoice 云 API
- `providers/cosyvoice-local.ts` — 本地 FunASR+CosyVoice
- `providers/kokoro.ts` — Kokoro TTS（自部署）
- `providers/gptsovits.ts` / `chattts.ts` — 开源 TTS
- `fallback-engine.ts` — 多层降级逻辑

#### Agent 视频工具

`src/lib/agent/tools/builtin/` 中注册的视频相关工具，使 LLM 可通过对话创作视频：

| 工具文件 | 功能 |
|----------|------|
| `generate-video.ts` | 通用视频生成（T2V/I2V，选模型+质量） |
| `generate-video-template.ts` | Remotion/Revideo 模板渲染 |
| `compose-video.ts` | 多段视频合成（顺序拼接） |
| `generate-product-video.ts` | 商品展示视频 |
| `generate-agnes-video.ts` | Agnes AI 视频生成 |
| `video-face-swap.ts` | 视频换脸 |
| `avatar-video.ts` | 数字人形象视频 |
| `smart-clip.ts` | 智能剪辑（口播去废话） |
| `auto-mashup.ts` | 自动混剪 |
| `generate-hyperframes.ts` | Hyperframes 关键帧视频 |
| `cover-generator.ts` | 视频封面生成 |

工具超时配置在 `src/lib/agent/tool-timeout.ts`，视频类工具超时较长（5-10 分钟）。

#### 视频 API 路由

| 端点 | 功能 |
|------|------|
| `POST /api/ai/video` | 视频生成主入口 |
| `POST /api/ai/video/generate` | 提交生成任务 |
| `POST /api/ai/video/one-click` | 一键生成（分镜→逐段生成→合并） |
| `POST /api/ai/video/generate-first-frames` | 生成各段首帧图 |
| `POST /api/ai/video/hyperframes` | Hyperframes 视频 |
| `POST /api/ai/video/storyboard-v2` | 分镜生成 |
| `POST /api/ai/video/merge` | 多段视频合并 |
| `POST /api/ai/video-mix/submit` + `/status` | 混剪提交 + 状态查询 |
| `POST /api/ai/analyze-video` | 视频内容分析 |
| `POST /api/ai/extract-video-text` | 提取视频文字 |
| `POST /api/ai/remotion/render` | Remotion 渲染触发 |
| `POST /api/ai/digital-human` | 数字人主入口 |
| `POST /api/ai/digital-human/animate` | 动作迁移 |
| `POST /api/ai/digital-human/merge` | 数字人+背景合并 |
| `POST /api/ai/digital-human/script` | 数字人脚本生成 |
| `POST /api/ai/digital-human/avatar/video` | 数字人形象→视频 |
| `POST /api/mashup/stream` | 混剪 SSE 流式进度 |
| `POST /api/mashup/analyze` | 素材分析 |
| `POST /api/mashup/execute` | 执行混剪合成 |

#### 前端视频页面

| 路由 | 功能 |
|------|------|
| `/ai/video` | 视频生成（T2V/I2V） |
| `/ai/video-mix` | 视频混剪 |
| `/ai/smart-clip` | 智能剪辑 |
| `/ai/digital-human` | 数字人形象 |
| `/ai/cover-generator` | 视频封面生成 |
| `/ai/mashup` | 混剪编排 |
| `/ai/tts` | 语音合成（用于视频配音） |

#### 视频生成数据流总结

```
用户输入（prompt / 图片 / 素材链接 / 脚本）
  │
  ├─→ 文生视频：submitVideoTask() → DashScope HappyHorse / Wan 2.6
  ├─→ 图生视频：submitI2VTask() → DashScope + 首帧图
  ├─→ Seedance：submitSeedanceTask() → 火山引擎 Ark
  ├─→ Agnes：submitAgnesVideoTask() → Agnes AI
  ├─→ 数字人：submitDigitalHumanTask() → DashScope wan2.2-s2v
  ├─→ 智能剪辑：extractAudio → transcribe → analyze → clip/slice → FFmpeg
  ├─→ 混剪：download → analyze → LLM arrange → composite → BGM
  ├─→ 模板渲染：Agent tool → revideo-render / remotion-render → 42 ECS → Supabase Storage
  └─→ 分镜→逐段生成→合并：storyboard → submitVideoTask ×N → concat
```

### Supabase 客户端层级

- `createClient()` → anon key (受 RLS 限制)
- `createAdminClient()` → service_role key (绕过 RLS，仅服务端)
- `createPgPool()` → 直连 Postgres (读 auth schema 等 PostgREST 禁的表)
- `createSupabaseServerClient()` → 带 cookie 的 SSR 客户端

### 共享常量

`style-constants.ts` 是全项目引用的常量文件，修改会影响多处：
- `PAGE_ROUTES` — 所有页面路由映射 (BottomNav、use-navigate 等引用)
- `PLATFORM_COLORS` — 平台品牌色 (热点列表、发布页等引用)
- `LANGUAGE_OPTIONS` / `STYLE_PRESETS` — AI 视频生成的语言和风格预设
- `TYPE_EMOJIS` / `TYPE_LABELS` — 内容类型图标和标签
- `BG_GLASS` / `BORDER_GLASS` 等 — 毛玻璃 UI 样式常量

### 阿里云 ECS 部署要点

- 服务器通过 GitHub Actions (`deploy-server.yml`) 自动部署：push main → SSH 到阿里云 → git pull → `npm ci && npm run build` → `pm2 restart lingji`
- `next.config.mjs`: `serverActions.bodySizeLimit: '30mb'`, `serverComponentsExternalPackages: ['pdf-parse', 'better-sqlite3']`
- build 命令为 `next build`，install 为 `npm install` (非 pnpm)
- pm2 管理 Next.js 进程，确保崩溃自动重启
- SQLite 数据库存储在 `process.cwd()/.data/`，ECS 磁盘可写

**ECS Crontab 时间表** (全部为北京时间):

| 时间 | 路径 | 用途 |
|------|------|------|
| 每天 08:00 | `/api/cron/check-hotspots` | 热点检查 |
| 每分钟 | `/api/jobs/claim` | AI 任务队列领取 |
| 每天 06:00 | `/api/platforms/metrics-fetch` | 平台指标拉取 |
| 每天 12:00 | `/api/platforms/scheduled-publish` | 定时发布 |
| 每月 1 日 16:00 | `/api/cron/credits-reset` | 点数重置 |
| 每天 00:00 | `/api/cron/subscription-grant` | 订阅点数发放 |

### GitHub Actions 工作流

| 文件 | 触发方式 | 用途 |
|------|----------|------|
| `deploy-server.yml` | push main 自动触发 | SSH 到阿里云 → build → pm2 restart |
| `deploy-app.yml` | 手动触发 (workflow_dispatch) | iOS (macos-15) / Android (ubuntu) 构建 + fastlane 发布 |
| `check-hotspots.yml` | 手动触发 (workflow_dispatch) | 热点检查备份（ECS crontab 是主力） |
| `cleanup-hotspots.yml` | 每月 1 号 UTC 16:00 + 手动触发 | 清理旧热点数据 |

### 构建移动应用

GitHub Actions 手动触发 (`deploy-app.yml`)：
- iOS: macos-15 runner → `npm ci` → `npm run build` → `npx cap sync ios` → fastlane TestFlight
- Android: ubuntu-latest → `npm ci` → `npm run build` → `npx cap sync android` → fastlane Play Store

服务端部署 (`deploy-server.yml`)：push main 自动触发 → SSH 到阿里云 → git pull → `npm ci && npm run build` → `pm2 restart lingji`
