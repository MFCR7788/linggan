# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

灵集 LingJi — AI 灵感收集 + 热点监控 + 内容创作工具，面向中文创作者。

## 常用命令

```bash
pnpm dev          # 开发服务器 (next dev)
pnpm build        # 生产构建 (next build)
pnpm lint         # ESLint 检查
pnpm test         # 运行所有 vitest 测试
pnpm test:watch   # vitest 监听模式
```

运行单个测试：`npx vitest run src/test/<test-file>.test.ts`

## 技术栈

- **前端**: Next.js 14 (App Router) + React 18 + TypeScript + TailwindCSS 3.4
- **后端**: Next.js API Routes + Supabase (Postgres, Auth, Storage)
- **AI 服务**: 阿里云百炼 DashScope (DeepSeek, Qwen, Wan, CosyVoice) + HeyGen (数字分身) + 火山引擎 TTS
- **移动端**: Capacitor 8 (iOS/Android 原生壳，WebView 承载 H5)
- **部署**: Vercel + 定时任务 (cron)
- **测试**: Vitest + jsdom + Testing Library

## 项目结构

```
src/
├── middleware.ts          # 认证守卫，拦截所有页面路由
├── app/
│   ├── layout.tsx         # 根布局：渐变背景 + StarBackground + mobile-first 容器 (max-w-[448px])
│   ├── page.tsx           # "/" → redirect 到 /login
│   ├── api/               # 40+ API 路由（ai/, auth/, credits/, hotspot/, inspiration/, 等）
│   └── <route>/page.tsx   # App Router 页面
├── lib/
│   ├── api-handler.ts     # withAuth / withHandler 包装器，消除 API 样板代码
│   ├── api-client.ts      # 前端 ApiClient 单例（get/post/put/delete/patch）
│   ├── supabase.ts        # 浏览器端 Supabase 客户端
│   ├── supabase-server.ts # 服务端客户端（createClient, createAdminClient, createPgPool, getCurrentUser）
│   ├── ai-services.ts     # 所有 AI API 调用（LLM, 生图, 生视频, TTS, 数字人, 声音复刻, 天气）
│   ├── credits.ts         # 点数系统（原子 CAS 扣点，RPC 降级，退款流水）
│   ├── credit-costs.ts    # 各功能扣点单价配置（改价走 git review）
│   ├── runtime-config.ts  # 运行时从 .env.local 文件系统读取（绕过 Next.js build 时 env 内联）
│   ├── jobs/              # AI 任务队列（enqueueBatch, claimNext, markFailed 带指数退避重试）
│   ├── platforms/         # 多平台集成（微信公众号 OAuth、微博 OAuth、加密存储）
│   ├── search/            # 联网搜索（百度 + Google/Bing）
│   └── ai/                # AI 子模块（avatar, chat, content, image, tts, video, vision 等）
├── components/            # 共享 UI 组件（BottomNav, GlassCard, Toast, 等）
│   └── workflow/          # 工作流引擎组件（StepWidgetRegistry + 各步骤 Widget）
├── hooks/                 # 自定义 React hooks
├── providers/             # React context providers
├── types/                 # TypeScript 类型定义（index.ts + supabase.ts）
└── test/                  # 测试文件（运行 `pnpm test`）
supabase/migrations/       # 18+ SQL 迁移文件
docs/                      # 需求文档、开发规划、数据库 schema
scripts/                   # 运维脚本（部署、截图生成、点数发放、cron 检查）
deploy/                    # 自部署服务（Kokoro TTS, FunASR 语音识别）
```

## 关键架构约定

### API 路由模式

所有需要认证的 API 路由使用 `withAuth` 包装，会自动处理用户验证和错误捕获：

```typescript
// src/app/api/xxx/route.ts
export const GET = withAuth(async ({ request, user, params }) => {
  return createApiResponse(data);
});
```

公开路由使用 `withHandler`（不强制认证，但已登录时 user 可用）。响应通过 `createApiResponse` / `createApiError` 统一格式 (`ApiResponse<T>`)。

### 点数系统

- `src/lib/credits.ts`：所有点数操作走此模块，不要直接操作 `user_credits` 表
- 扣点用 `consume(userId, amount, source, description)` → 余额不足抛 `InsufficientCreditsError`
- 加点用 `grant(userId, amount, type, source, description)`
- AI 任务失败退点用 `refund(userId, amount, source, description)`
- 单价配置在 `src/lib/credit-costs.ts`，不在数据库里（改价需 git review）
- 使用 PostgreSQL RPC 实现原子操作，有降级的 CAS 兜底方案

### 认证

- 生产环境：Supabase Auth (`getCurrentUser` 在 `supabase-server.ts`)
- 开发环境：通过 `dev_user_id` cookie 或 `x-dev-user-id` header 绕过认证
- 生产部署前必须删除 `middleware.ts` 和 `supabase-server.ts` 中的 dev auth 快捷路径
- 环境变量 `AUTH_SALT` 首次上线后不可变更（用于手机号登录的 deterministic password）

### 环境变量

`.env.local` 中的敏感配置不在 build 时内联，通过 `src/lib/runtime-config.ts` 在运行时从文件系统加载。读取 API key 等敏感值时用 `getDashScopeApiKey()` 等函数而非 `process.env` 直接访问。

### 移动端适配

- 设计为 mobile-first：主容器 `max-w-[448px]`，桌面端居中显示
- 使用 Capacitor 生成 iOS/Android 原生壳，`capacitor.config.ts` 中配置 Vercel URL
- 注意 iOS safe area 适配（`env(safe-area-inset-*)`）
- `@capacitor/preferences` 用于原生端本地持久化

### AI 任务队列 (V2.0.1)

`src/lib/jobs/queue.ts` 实现了基于 ai_tasks 表的异步任务队列：
- 批量提交 `enqueueBatch` → worker 抢占 `claimNext` → 更新进度 → 标记完成/失败
- 失败自动重试（指数退避：30s → 2min → 8min）
- `/api/jobs/claim` 端点由 Vercel cron 定时触发

### Supabase

- `createClient()` → anon key（受 RLS 限制）
- `createAdminClient()` → service_role key（绕过 RLS，仅服务端用）
- `createPgPool()` → 直连 Postgres（用于读 auth schema 等 PostgREST 禁的表）
- 18 个迁移文件在 `supabase/migrations/` 目录，按序号排列
