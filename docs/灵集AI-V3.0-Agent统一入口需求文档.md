# 灵集 AI V3.0 — Agent 统一入口 + 灵感助手整合 需求文档

> 2026-06-10 | 状态：规划阶段

---

## 一、背景与目标

### 1.1 当前问题

灵集 AI 有两个 AI 交互入口，各自为政：

| 入口 | 页面 | 定位 | 问题 |
|------|------|------|------|
| AI 创作中心 | `/ai` | 工具超市 + 方案推荐 | 9 个工具卡片 + 方案 + 作品，信息过密，需要学习成本 |
| 灵感助手 | `/capture` | 聊天式 AI 助手 | 有 RAG、语音、TTS、日程提取等，但 Agent 没有 |
| 对话 Agent | `/agent` | 多轮工具调用 Agent | 最强大但入口最不显眼（底部导航 "+" 按钮） |

三个入口的**底层 AI 能力高度重叠**（都用 DeepSeek/Qwen，都调 DashScope），但各有一套交互方式和功能集，造成：
- 用户困惑：到底该用哪个？
- 功能分散：灵感助手能提取日程但 Agent 不能，Agent 能搜热点但灵感助手只能搜网页
- 维护负担：三套 UI + 两套 pipeline 逻辑

### 1.2 目标

**把 Agent 打造成灵集唯一的 AI 交互入口**，具备以下特性：

1. **零学习成本**：像 ChatGPT 一样，说一句话就能开始
2. **能力完整**：所有 AI 工具+技能+方案融入 Agent，自动识别需求并调用
3. **参数可选**：需要参数时，以卡片形式展示选项让用户点选，而非让用户手填
4. **渐进式交互**：简单需求直接出结果，复杂需求逐步引导

---

## 二、当前 Agent 缺失功能清单

基于对灵感助手 (`/capture`) 和 AI 创作中心的完整分析，以下是 Agent 尚未具备的功能：

### 2.1 输入层（纯交互，不改后端）

| 功能 | 当前状态 | 融入 Agent 方式 |
|------|---------|---------------|
| 按住说话（语音输入） | Agent 已有 `useVoiceRecording` | ✅ 已实现 |
| 图片粘贴 | Agent 无 | 新增 onPaste 处理 |
| 斜杠命令菜单 | 灵感助手有 8 个 | 改为 Skill 推荐卡片 |
| 输入框全屏编辑器 | 灵感助手有 | 长按展开 |
| 模型选择器 | 灵感助手有下拉 | Agent 默认自动，高级设置里可切换 |

### 2.2 工具层（需新增 Agent Tool）

| 功能 | 当前所属 | 优先级 | 说明 |
|------|---------|--------|------|
| **AI 文案生成** | AI 创作中心 | P0 | 多平台多风格文案，参数：平台/风格/长度/角度数 |
| **图片编辑** | AI 创作中心 | P1 | 去背景、变清晰、智能扩展 |
| **九宫格广告** | AI 创作中心 | P1 | 6 种场景的 9 图生成 |
| **数字人视频** | AI 创作中心 | P1 | 静态肖像+音频→视频 |
| **视频合并** | AI 创作中心 | P2 | 多段视频拼接+BGM+字幕 |
| **日程提取** | 灵感助手 | P1 | NLP 解析→结构化日程，Agent 对话中自然提取 |
| **链接分析** | 灵感助手 | P1 | 识别 URL→抓取内容→注入上下文 |
| **内容改写** | 灵感助手 | P2 | 5 种风格（简洁/详细/随意/正式/小红书风） |
| **流式 TTS 朗读** | 灵感助手 | P2 | AI 回复逐句朗读，非一次性合成 |
| **保存到灵感库** | 灵感助手 | P1 | Agent 对话中的内容一键保存 |
| **添加到日程** | 灵感助手 | P1 | AI 提取的日程一键添加 |
| **对标账号分析** | 灵感助手 | P2 | 分析对标账号风格 |

### 2.3 技能层（Skill → 自动绑定工具链）

| 技能名称 | 触发条件 | 绑定工具链 | 来源 |
|---------|---------|-----------|------|
| **小红书种草** | "小红书"+"种草/推荐/测评" | copywriting → generate_image | AI 创作 |
| **公众号长文** | "公众号"+"文章/推文" | search_knowledge → copywriting → generate_image | AI 创作 |
| **短视频脚本** | "短视频"+"脚本/文案" | copywriting → generate_video | AI 创作 |
| **抖音口播** | "抖音"+"口播/带货" | copywriting → synthesize_speech | AI 创作 |
| **热点借势** | "热点"+"蹭/借势/追踪" | get_hotspot → copywriting → generate_image | AI 创作 |
| **产品九宫格** | "九宫格"+"产品/朋友圈" | copywriting → 九宫格生成 | AI 创作 |
| **数字人讲解** | "数字人"+"讲解/播报" | copywriting → synthesize_speech → 数字人 | AI 创作 |
| **灵感处理** | 粘贴链接/文件 | analyze_link → summarize → 保存灵感库 | 灵感助手 |
| **日程提取** | "...时间...做..." | 日程提取 → 添加到日程 | 灵感助手 |
| **对标分析** | "分析"+"对标/竞品/账号" | web_search → analyze → summarize | 灵感助手 |

### 2.4 交互层（Agent UI 新增组件）

| 组件 | 说明 |
|------|------|
| **参数选择卡片** | 当工具需要参数时，以卡片形式展示选项（下拉/标签/开关） |
| **Skill 推荐卡片** | Agent 空状态展示 4-6 个推荐技能 |
| **能力标签栏** | 输入框上方展示 Agent 可用能力图标 |
| **生成进度卡片** | 视频/数字人等长任务展示进度+预计时间 |
| **内容操作菜单** | 每条 AI 回复下方：保存灵感/添加日程/复制/朗读/重新生成 |
| **确认对话框** | 扣点操作前确认（图片/视频/数字人生成） |

---

## 三、AI 创作页面迁移方案

### 3.1 当前 AI 创作页面内容

```
┌─────────────────────────────────┐
│ 1. 继续创作（进行中的工作流）     │ → 移到 Agent 会话列表
│ 2. 推荐方案（账号适配组合）       │ → 转为 Skill 推荐卡片
│ 3. 方案 vs 工具 说明             │ → 移除（不再需要区分）
│ 4. AI 创作工具 3x3 网格          │ → 全部注册为 Agent Tool
│ 5. 效果数据                      │ → 移到「我的」页面
│ 6. 最近作品                      │ → 移到「灵感库」页面
└─────────────────────────────────┘
```

### 3.2 迁移映射

| AI 创作工具 | 转为 Agent Tool | 参数 |
|------------|----------------|------|
| AI 文案 | `generate_copywriting` | platform, style, length, angles |
| AI 图片 | `generate_image`（已有）| aspectRatio, style, count |
| AI 图片编辑 | `edit_image` | operation (去背景/变清晰/扩展) |
| AI 配音 | `synthesize_speech`（已有）| voice, speed, pitch |
| AI 数字人 | `generate_digital_human` | 肖像图, 音频, 分辨率 |
| AI 视频 | `generate_video`（已有）| quality, duration, style |
| 9 宫格 | `generate_grid_images` | scene, product_images |
| AI 热点选题 | `get_hotspot`（已有）| — |
| 多平台分发 | `publish_content` | platforms, schedule_time |

### 3.3 推荐方案 → Skill 转换

当前 `src/lib/account-presets.ts` 定义的各种方案，转为 Skill：

```typescript
// 示例：小红书博主 Skill
{
  name: 'redbook-influencer',
  displayName: '小红书种草',
  triggerKeywords: ['小红书', '种草', '推荐', '好物', 'RED'],
  boundTools: ['generate_copywriting', 'generate_image'],
  steps: [
    { tool: 'generate_copywriting', params: { platform: 'xiaohongshu' } },
    { tool: 'generate_image', params: { aspectRatio: '3:4' } },
  ],
}
```

### 3.4 底部导航调整

```
当前：              →    调整后：
首页  灵感库  +  AI创作  我的    首页  灵感库  🤖  灵感库  我的
                                    （Agent 为中心按钮）
```

PageKey "ai" 路由从 `/ai` 改为 `/agent`，移除 `/ai` 页面（保留内部路由如 `/ai/copywriting` 作为深度链接，但不再在导航中出现）。

---

## 四、灵感助手工作流分析

### 4.1 当前工作流

```
用户输入（文本/图片/链接/语音/文档）
        │
        ▼
┌───────────────────────────────────┐
│ ContextPipeline.execute()          │
│                                     │
│ 1. 生成 Embedding                   │
│ 2. 并行检索：记忆 + 灵感库 + 知识库  │
│ 3. 意图检测（11 种）                │
│ 4. 选择对应 System Prompt           │
│ 5. 组装上下文 → LLM 调用            │
└───────────────────────────────────┘
        │
        ▼
    AI 回复（文本/图片/视频/日程）
        │
        ▼
   用户操作：保存灵感 / 添加日程 / 复制 / 朗读 / 重新生成
```

### 4.2 与 Agent 的差异

| 维度 | 灵感助手 | Agent |
|------|---------|-------|
| 对话模式 | 单轮（一问一答） | 多轮 ReAct 循环（think→act→observe→repeat） |
| 工具调用 | 无（LLM 直接输出） | 12 个工具可按需调用 |
| 上下文 | RAG pipeline（记忆+灵感+知识库） | ContextEngine（token 感知压缩） |
| 主动性 | 被动回复 | 主动反问、澄清需求 |
| 持久化 | 会话历史存 Supabase | 会话历史存 Supabase |
| 特殊能力 | 日程提取、语音输入、TTS 朗读 | 工具并行、MCP 扩展、Hook 系统 |

### 4.3 整合策略

灵感助手的**后端 Pipeline（RAG 检索+意图检测）应该融入 Agent 的上下文组装**，而不是保留为独立系统：

1. **RAG 检索** → 作为 Agent 的 ContextSource 插件
2. **意图检测** → 对应 Agent 的 Skill 匹配（触发关键词→绑定工具链）
3. **日程提取** → 新增 `extract_schedule` Agent Tool
4. **语音输入+朗读** → Agent UI 已部分具备，补全即可

灵感助手的**前端交互**可以保留为 Agent 的"快速模式"：简化版 UI，隐藏工具调用细节，适合简单问答。标准 Agent 模式展示完整思考链。

---

## 五、实施计划

### Phase 1: 基础工具补全（3-5 天）

**目标**：Agent 具备所有 AI 创作能力

| 任务 | 文件 | 说明 |
|------|------|------|
| 新增 `generate_copywriting` tool | `src/lib/agent/tools/builtin/copywriting.ts` | 多平台多风格文案，参数 schema 定义 |
| 新增 `edit_image` tool | `src/lib/agent/tools/builtin/edit-image.ts` | 去背景/变清晰/扩展 |
| 新增 `generate_grid_images` tool | `src/lib/agent/tools/builtin/grid-images.ts` | 9 宫格广告图 |
| 新增 `generate_digital_human` tool | `src/lib/agent/tools/builtin/digital-human.ts` | 数字人视频 |
| 新增 `extract_schedule` tool | `src/lib/agent/tools/builtin/extract-schedule.ts` | 日程提取 |
| 新增 `analyze_link` tool | `src/lib/agent/tools/builtin/analyze-link.ts` | 链接分析 |
| 新增 `save_to_inspiration` tool | `src/lib/agent/tools/builtin/save-inspiration.ts` | 保存到灵感库 |
| 新增 `publish_content` tool | `src/lib/agent/tools/builtin/publish.ts` | 多平台发布 |

### Phase 2: Skill 体系（2-3 天）

**目标**：推荐方案+技能全转为 Skill，自动绑定工具链

| 任务 | 说明 |
|------|------|
| 扩展 SkillDefinition 增加 `triggerKeywords` + `boundTools` + `steps` | `src/lib/assistant/types.ts` |
| 将 `account-presets.ts` 中所有方案转为 Skill 定义 | `src/lib/assistant/skills/` |
| Skill 匹配后自动注册绑定工具到 ToolRegistry | 已有 `tool-binding.ts` |
| Agent 空状态展示匹配的 Skill 推荐卡片 | UI 改动 |

### Phase 3: Agent UI 升级（3-5 天）

**目标**：Agent 成为完整的小白友好入口

| 任务 | 说明 |
|------|------|
| **参数选择卡片** | `ParamCard` 组件 — 工具需要参数时弹出，选项以标签/下拉/开关展示 |
| **Skill 推荐卡片** | 空状态展示 4-6 个推荐技能卡片（带 emoji + 描述） |
| **能力标签栏** | 输入框上方横向滚动的能力图标（搜索/生图/视频/配音/数字人/日程...） |
| **内容操作菜单** | AI 回复下方按钮组：保存灵感/添加日程/复制/朗读/重新生成 |
| **扣点确认** | 生图/视频/数字人等扣点操作前弹确认（显示单价） |
| **新增返回按钮** | 顶部加 ← 返回首页 |
| **placeholder 优化** | "试试说：帮我写一篇小红书种草文案..." |

### Phase 4: 导航与路由调整（1-2 天）

**目标**：移除 AI 创作页面，Agent 成为主入口

| 任务 | 说明 |
|------|------|
| 底部导航：AI创作 → Agent（中间 "+" 改为 "🤖 AI助手" 加文字标签） | `BottomNav.tsx` |
| 移除 `/ai` 页面入口（内部子页面保留） | 路由调整 |
| "效果数据" → 移到「我的」页面 | `profile/page.tsx` |
| "最近作品" → 移到「灵感库」（已有的筛选支持） | 不需要改 |
| 灵感助手 (`/capture`) → 保留为 Agent 的快速模式入口 | 可选 |

### Phase 5: 灵感助手融入（3-5 天）

**目标**：统一 AI 后端，消除双 pipeline

| 任务 | 说明 |
|------|------|
| RAG 检索转为 Agent ContextSource | `src/lib/context/sources/` |
| 意图检测改为 Skill 匹配 | 复用 SkillMatcher |
| 链接分析转为 Agent Tool | Phase 1 已做 |
| 日程提取转为 Agent Tool | Phase 1 已做 |
| 灵感助手前端可选保留为简化 Agent 模式 | 评估后再定 |

---

## 六、不改动的部分

以下保持现状：

- **灵感库** (`/inspiration`)：独立页面，不受影响
- **热点监控** (`/hotspot`)：独立页面，不受影响
- **「我的」页面** (`/profile`)：保持，增加「效果数据」入口
- **发布页面** (`/publish`)：作为 Agent Tool 可调用，但也保留独立入口
- **工作流详情** (`/workflow/[id]`)：在 Agent 中继续运行，但保留独立页面
- **所有 AI 子页面** (`/ai/copywriting`, `/ai/image` 等)：保留路由，支持深度链接
- **灵感助手** (`/capture`)：暂时保留，Phase 5 再决定去留

---

## 七、关键设计原则

1. **选择优于输入**：所有参数做成可选项，用户点选而非手填
2. **渐进式复杂度**：简单对话 → 参数卡片 → 工具调用详情，按需展开
3. **一个入口，全部能力**：Agent 是唯一的 AI 交互窗口
4. **自动路由，手动可控**：默认自动识别需求，但保留手动选择 Skill 的能力
5. **向后兼容**：移除 AI 创作页面前，确保新入口功能完整覆盖
