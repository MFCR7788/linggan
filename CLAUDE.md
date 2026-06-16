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

运行单个测试：`npx vitest run src/test/<file>.test.ts`

vitest 配置了 `globals: true`，测试文件中 `describe`/`it`/`expect`/`vi` 无需 import。

**Playwright E2E 测试**：`.claude/test-settings.mjs` 包含完整的 Playwright E2E 测试脚本，使用 Chromium + dev auth 注入，可测试 profile/settings 等受保护页面。手动运行该脚本需要先启动 `pnpm dev`，然后 `node .claude/test-settings.mjs`。

## 技术栈

- **前端**: Next.js 14 (App Router) + React 18 + TypeScript + TailwindCSS 3.4
- **后端**: Next.js API Routes + Supabase (Postgres, Auth, Storage)
- **AI 服务**: 阿里云 DashScope (DeepSeek, Qwen, Wan, CosyVoice) + 火山引擎豆包 + OpenRouter + HeyGen + ElevenLabs + jina.ai Reader
- **移动端**: Capacitor 8，WebView 加载生产 URL (`https://ai.zjsifan.com`)
- **部署**: 阿里云 ECS (前端 + API + FunASR/Kokoro) + pm2
- **测试**: Vitest + jsdom + @testing-library/react，Playwright 用于 E2E
- **CI/CD**: GitHub Actions (移动端发布到 TestFlight/Play Store, 服务端部署到阿里云)
- **包管理器**: 本地开发用 pnpm（有 `pnpm-lock.yaml`），GitHub Actions 用 npm（有 `package-lock.json`），两个 lockfile 需保持同步
- **模块系统**: ESM (`"type": "module"`)，CommonJS 配置文件使用 `.cjs` 扩展名 (`postcss.config.cjs`)

## 项目结构

```
src/
├── middleware.ts          # 认证守卫，拦截所有页面路由 (protectedPaths)
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
│   ├── ai-services.ts     # 旧 AI 调用入口 (逐步迁移到 ai/ 子模块)
│   ├── ai/                # AI 子模块 (chat, vision, image, video, tts, digital-human, avatar, content, storyboard, weather, usage)
│   ├── jobs/              # AI 任务队列 (queue, task-worker, hotspot-checker + workers/)
│   ├── platforms/         # 多平台集成 (微信公众号/微博 OAuth, 加密存储, 发布)
│   ├── agent/             # 对话 Agent 引擎 (conversational loop, SSE streaming, tool calling)
│   ├── assistant/         # AI 创作助手 (RAG pipeline, memory/知识库, intent 检测, context compressor)
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
└── test/                 # 11 个测试文件 + setup.ts
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
  - Middleware 读取 `dev_user_id` cookie 绕过 Supabase Auth 认证 (仅 localhost 或配置了 `DEV_AUTH_SECRET` 时)
  - 可选 `DEV_AUTH_SECRET` 保护 dev auth 入口，否则仅限 localhost
- **生产部署前必须删除** `middleware.ts` 和 `supabase-server.ts` 中的 dev auth 快捷路径
- `AUTH_SALT` 首次上线后不可变更 (用于手机号登录的 deterministic password)
- Middleware 有 GoTrue 降级机制：Supabase Auth 故障时回退检查 `lingji_auth_user_id` cookie (由 `lingji_auth` API 设置)，保证可用性

### 环境变量

- `.env.local` 中的敏感配置通过 `src/lib/runtime-config.ts` 运行时从文件系统读取，不依赖 Next.js build 时内联
- 读取 API key 用 `getDashScopeApiKey()` 等专有函数，不用 `process.env` 直接访问
- `CRON_SECRET` 用于保护 cron 调用的端点 (`/api/jobs/claim`, `/api/platforms/metrics-fetch`)

> **注意**: Middleware 中 Supabase 客户端使用 `process.env.SUPABASE_ANON_KEY`（无 `NEXT_PUBLIC_` 前缀），但 `.env.example` 中定义为 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。`.env.local` 中两个变量名均需设置。

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
- `tools/` — 可注册的工具函数 (搜索、读取灵感、查询热点等)
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

### 构建移动应用

GitHub Actions 手动触发 (`deploy-app.yml`)：
- iOS: macos-15 runner → `npm ci` → `npm run build` → `npx cap sync ios` → fastlane TestFlight
- Android: ubuntu-latest → `npm ci` → `npm run build` → `npx cap sync android` → fastlane Play Store

服务端部署 (`deploy-server.yml`)：push main 自动触发 → SSH 到阿里云 → git pull → `npm ci && npm run build` → `pm2 restart lingji`
