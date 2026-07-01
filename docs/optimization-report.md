# 灵集 LingJi 代码优化报告

> 由 Codex 审核自动生成 | 2026-07-01
> 目标读者：Claude Code / AI Coding Agent
> 执行方式：按章节逐一执行，每节完成后运行验证命令确认通过

---

## 执行约定

- 所有文件路径相对于项目根目录 `/Users/aplle/Documents/Zjsifan/Tools/lingji`
- 每完成一节，运行该节末尾的**验证命令**确保无回归
- 包管理器：`pnpm`（本地开发）
- 测试框架：`vitest`，配置了 `globals: true`
- 修改前先用 `git stash` 保存现场，方便回滚

---

## 第一节：安全 — 消除 process.env 直接访问 [P1]

### 背景

项目有 `src/lib/runtime-config.ts` 做运行时配置读取（绕过 Next.js build 时内联），但 50+ 处代码仍直接用 `process.env` 读取密钥。这些值在 `next build` 时会被硬编码进构建产物，后续密钥轮换不会生效。

### 需修改的文件与操作

#### 1.1 `src/lib/supabase-server.ts` — Supabase 客户端密钥

当前代码直接使用 `process.env.SUPABASE_ANON_KEY`、`process.env.SUPABASE_SERVICE_ROLE_KEY`、`process.env.DATABASE_URL`。

**操作**：添加以下 import 并将 `process.env.XXX` 替换为 `getXXX()`：

```typescript
// 新增 import
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/runtime-config';
```

然后在 `createClient()` 和 `createSupabaseServerClient()` 中：
- `process.env.SUPABASE_ANON_KEY!` → `getSupabaseAnonKey()`
- `process.env.NEXT_PUBLIC_SUPABASE_URL!` → `getSupabaseUrl()`

在 `createPgPool()` 中：
- `process.env.DATABASE_URL` → `getEnv('DATABASE_URL')`（已在 runtime-config 中导出 `getEnv`）
- 添加 `import { getEnv } from '@/lib/runtime-config';`

在 `createAdminClient()` 中：
- 需要先在 `runtime-config.ts` 中添加一个新函数 `getSupabaseServiceRoleKey()`
- 然后替换 `process.env.SUPABASE_SERVICE_ROLE_KEY!`

**补充 `src/lib/runtime-config.ts`**：添加：

```typescript
export function getSupabaseServiceRoleKey(): string {
  return getEnv('SUPABASE_SERVICE_ROLE_KEY') || '';
}
```

#### 1.2 `src/lib/platforms/wechat-mp.ts` — 微信公众号密钥

```typescript
// 新增 import
import { getEnv } from '@/lib/runtime-config';

// 替换
// private get appId() { return process.env.WECHAT_MP_APP_ID || ''; }
private get appId() { return getEnv('WECHAT_MP_APP_ID') || ''; }
```

同时修改 `getAccessToken()` 等方法中的 `process.env.WECHAT_MP_APP_SECRET`：
- 先确认 `runtime-config.ts` 中已有 `getWechatMpAppSecret()` 函数
- 将 `process.env.WECHAT_MP_APP_SECRET` → `getWechatMpAppSecret()`

#### 1.3 `src/lib/platforms/weibo.ts` — 微博密钥

```typescript
import { getEnv } from '@/lib/runtime-config';

// private get appKey() { return process.env.WEIBO_APP_KEY || ''; }
private get appKey() { return getEnv('WEIBO_APP_KEY') || ''; }
```

同时添加并替换 `WEIBO_APP_SECRET`。

#### 1.4 `src/lib/platforms/bilibili.ts` — B站密钥

```typescript
import { getEnv } from '@/lib/runtime-config';

// clientId: process.env.BILIBILI_CLIENT_ID || '',
// clientSecret: process.env.BILIBILI_CLIENT_SECRET || '',
clientId: getEnv('BILIBILI_CLIENT_ID') || '',
clientSecret: getEnv('BILIBILI_CLIENT_SECRET') || '',
```

#### 1.5 `src/lib/media-search/pixabay.ts` — Pixabay API Key

```typescript
import { getPixabayApiKey } from '@/lib/runtime-config';

// return typeof process !== 'undefined' ? (process.env.PIXABAY_API_KEY || '') : '';
return getPixabayApiKey() || '';
```

#### 1.6 `src/lib/media-search/pexels.ts` — Pexels API Key

```typescript
import { getPexelsApiKey } from '@/lib/runtime-config';

// process.env.PEXELS_API_KEY → getPexelsApiKey()
```

#### 1.7 `src/lib/media-search/unsplash.ts` — Unsplash API Key

```typescript
import { getUnsplashAccessKey } from '@/lib/runtime-config';

// process.env.UNSPLASH_ACCESS_KEY → getUnsplashAccessKey()
```

#### 1.8 `src/lib/wechat-pay.ts` — 微信支付配置

```typescript
import { getEnv } from '@/lib/runtime-config';

// 将所有 process.env.WECHAT_PAY_XXX 替换为 getEnv('WECHAT_PAY_XXX')
```

#### 1.9 `src/lib/media-search/keyword-translator.ts` — DeepSeek Key

```typescript
import { getDeepSeekApiKey } from '@/lib/runtime-config';

// 将 process.env.DEEPSEEK_API_KEY 替换为 getDeepSeekApiKey()
```

#### 1.10 AI/TTS 模块中的 fallback process.env

以下文件中有 `process.env.DASHSCOPE_API_KEY` 作为 fallback，替换为 `getDashScopeApiKey()`：

- `src/lib/ai/tts/providers/cosyvoice-cloud.ts`
- `src/lib/subtitles/optimizer.ts`
- `src/app/api/inspiration/route.ts`
- `src/app/api/cron/prompt-self-optimize/route.ts`（CRON_SECRET → `getCronSecret()`）

#### 1.11 `src/app/api/debug/credits-status/route.ts` — Debug 端点

```typescript
import { getSupabaseServiceRoleKey } from '@/lib/runtime-config';

// process.env.SUPABASE_SERVICE_ROLE_KEY → getSupabaseServiceRoleKey()
```

### 保持不变的 process.env 访问（不需要改）

以下 `process.env` 访问是故意的或无害的：
- `src/lib/runtime-config.ts` 自身的 `process.env` fallback（设计如此）
- `FFMPEG_PATH`、`FFPROBE_PATH`、`PUPPETEER_EXECUTABLE_PATH` 等路径类配置（不是密钥）
- `CHROMIUM_PATH`、`REVIDEO_PORT`、`REVIDEO_SECRET` 等 revideo 独立服务配置
- `HTTP_PROXY`、`HTTPS_PROXY` 等标准环境变量
- 测试文件中的 `process.env`
- `DATABASE_URL` 的检查（仅判空，不是读值）

### 验证命令

```bash
pnpm build 2>&1 | tail -5
# 应显示构建成功
```

---

## 第二节：测试 — 修复 6 个失败的测试文件 [P0]

### 背景

运行 `pnpm test` 有 6 个测试文件失败、11 个测试用例失败。核心点数系统的测试 mock 不完整。

### 2.1 `src/test/credits.test.ts` — 点数系统测试

**问题**：mock 的 `supabase.from()` chain 缺少 `upsert` 方法，`getBalance()` 在无记录时调用 `.upsert()` 失败。

**操作**：在 `chain()` 函数的 `builder` 对象中添加 `upsert` mock：

```typescript
// 在 chain() 函数的 builder 对象中添加：
upsert: vi.fn(() => builder),
```

同时确保 `upsert` 返回的 chain 支持 `.select()`：

```typescript
// 为 upsert 场景添加 select 支持
const builder: Record<string, any> = {
  select: vi.fn(() => builder),
  insert: vi.fn(() => builder),
  update: vi.fn(() => builder),
  upsert: vi.fn(() => builder),  // ← 新增
  eq: vi.fn(() => builder),
  // ... 其余方法
};
```

### 2.2 `src/test/providers/model-router.test.ts` — ModelRouter 测试

**问题**：`resolveModel('custom-model')` 期望返回 `'custom-model'`，但 `ModelRouter.resolveModel()` 在找不到匹配时会 fallback 到 provider 的默认模型。

**操作**：修改测试用例使其与实际行为一致。有两种方案：

**方案 A（推荐）**：修改测试，让 `custom-model` 在 provider 的 models 中存在：
```typescript
// 在 it('解析指定模型', ...) 中
const resolved = router.resolveModel('test-model'); // 用已注册的模型 ID
expect(resolved.model).toBe('test-model');
```

**方案 B**：如果确实需要测试 fallback 行为：
```typescript
it('未注册模型时 fallback 到 provider 默认模型', () => {
  const resolved = router.resolveModel('unknown-model');
  expect(resolved.model).toBe('test-model'); // fallback
});
```

### 2.3 其他失败的测试文件

运行以下命令获取完整失败列表：

```bash
npx vitest run 2>&1 | grep "FAIL"
```

逐个查看失败原因并根据相同原则修复（mock 不完整 / 断言与实际行为不符）。

### 验证命令

```bash
pnpm test 2>&1 | tail -10
# 应显示 "Tests  0 failed | 340 passed"
```

---

## 第三节：架构 — 拆分巨型文件 [P1]

### 3.1 `src/app/api/ai/chat/route.ts`（1002 行）

**目标**：降到 200 行以内，核心逻辑迁移到 `src/lib/assistant/`。

**拆分方案**：

1. 创建 `src/lib/assistant/chat-pipeline.ts`，提取：
   - `stripMarkdown()` 函数
   - `extractJSON()` 函数
   - `buildSystemPrompt()` — 系统提示词构建
   - `assembleContext()` — RAG 上下文组装（Memory + Knowledge + Intent）
   - `executeChatPipeline()` — 主 pipeline 编排函数

2. 创建 `src/lib/assistant/chat-stream.ts`，提取：
   - SSE 流式输出的处理逻辑
   - 流式响应的 `ReadableStream` 构建

3. 修改 `src/app/api/ai/chat/route.ts`，只保留：
   - `withAuth` 包装
   - 请求体解析和校验
   - 调用 `executeChatPipeline()`
   - 返回 `NextResponse`

**操作步骤**：
1. 先创建 `chat-pipeline.ts` 和 `chat-stream.ts`
2. 将对应代码复制过去，调整 import
3. 修改 route.ts 为薄调用层
4. 运行测试确保 `chat` 相关测试仍通过

### 3.2 `src/components/agent/AgentChatView.tsx`（2604 行）

**目标**：拆分到 500 行以内，提取独立组件和 hooks。

**拆分方案**：

1. 提取 `useAgentChat.ts` hook — 聊天状态管理（messages、streaming、send/cancel/retry）
2. 提取 `AgentMessageBubble.tsx` — 单条消息渲染组件
3. 提取 `AgentInputBar.tsx` — 输入框 + 附件 + 发送按钮
4. 提取 `AgentSuggestionPanel.tsx` — 建议面板

### 3.3 `src/app/ai/digital-human/page-content.tsx`（1994 行）和 `src/app/ai/video/page-content.tsx`（1538 行）

类似策略：按功能区域提取子组件。

### 验证命令

```bash
pnpm build && pnpm test
# 确保构建和测试通过
```

---

## 第四节：健壮性 — .single() 替换为 .maybeSingle() [P2]

### 背景

项目中 `.single()` 使用 61 次。POSTGrest 的 `.single()` 在返回 0 行或 >1 行时会抛异常。如果预期可能为空，应使用 `.maybeSingle()`。

### 需要审查并修改的文件

以下文件使用了 `.single()`，需逐一审查是否需要改为 `.maybeSingle()`：

| 文件 | 次数 | 风险 |
|------|------|------|
| `src/app/api/user/route.ts` | 3 | 中 |
| `src/app/api/workflow/sessions/[id]/route.ts` | 3 | 中 |
| `src/app/api/schedule/[id]/route.ts` | 4 | 高 |
| `src/app/api/platforms/publish/route.ts` | 4 | 高 |
| `src/app/api/categories/route.ts` | 3 | 中 |
| `src/app/api/chat/history/route.ts` | 3 | 中 |
| `src/app/api/keywords/[id]/route.ts` | 2 | 中 |
| `src/app/api/user/profile/route.ts` | 2 | 中 |
| `src/app/api/captcha/click/route.ts` | 1 | 低 |
| 其他 | 若干 | - |

### 修改规则

对于每条 `.single()` 调用：

1. 如果后续代码检查了 `if (!data)` 或类似判断 → 改为 `.maybeSingle()`（安全替换）
2. 如果后续代码直接使用 `.data.xxx` 且不检查 null → 改为 `.maybeSingle()` 并添加 null check
3. 如果业务逻辑确实要求恰好 1 行（如按主键查询）→ 保留 `.single()` 但添加 try-catch

### 示例修改

```typescript
// 修改前
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .single();

// 修改后（方案1：maybeSingle + null check）
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle();

if (!data) {
  return createApiError('用户不存在', 404);
}
```

### 验证命令

```bash
pnpm test && pnpm build
```

---

## 第五节：ESLint Warnings 清理 [P3]

### 当前 Warning 清单

```
src/components/agent/AgentChatView.tsx — 2 个 react-hooks/exhaustive-deps
src/components/agent/ChoiceCards.tsx — 1 个 jsx-a11y/alt-text
src/components/agent/InspirationPicker.tsx — 2 个 jsx-a11y/alt-text
src/components/workflow/widgets/AdsStepWidget.tsx — 1 个 react-hooks/exhaustive-deps
src/components/workflow/widgets/CopywritingStepWidget.tsx — 1 个 react-hooks/exhaustive-deps
src/components/workflow/widgets/DigitalHumanStepWidget.tsx — 2 个 react-hooks/exhaustive-deps
src/components/workflow/widgets/ImageStepWidget.tsx — 1 个 react-hooks/exhaustive-deps
src/components/workflow/widgets/TtsStepWidget.tsx — 1 个 react-hooks/exhaustive-deps
src/hooks/use-batch-tasks.ts — 1 个 react-hooks/exhaustive-deps
```

### 修复策略

- **react-hooks/exhaustive-deps**：逐个评估是否真的需要把缺失的依赖加入数组。如果是有意省略（如只想在 mount 时执行），用 `// eslint-disable-next-line react-hooks/exhaustive-deps` 并添加注释说明原因。
- **jsx-a11y/alt-text**：为 `<img>` 添加 `alt` 属性（装饰性图片用 `alt=""`，内容性图片用描述文字）。

### 验证命令

```bash
pnpm lint 2>&1 | grep "Warning"
# 应为空
```

---

## 优化顺序建议

```
第一节（P1 安全）→ 验证通过
  ↓
第二节（P0 测试）→ 验证通过
  ↓
第五节（P3 ESLint）→ 验证通过
  ↓
第四节（P2 健壮性）→ 验证通过
  ↓
第三节（P1 架构）→ 验证通过
```

前三节可以并行执行（互不依赖），第四、五节也可以并行。第三节架构拆分最复杂，建议最后做。

---

## 附：快速验证脚本

```bash
#!/bin/bash
# 放在项目根目录，每次修改后运行
set -e
echo "=== Lint ==="
pnpm lint
echo "=== Test ==="
pnpm test
echo "=== Build ==="
pnpm build
echo "=== All Passed ==="
```
