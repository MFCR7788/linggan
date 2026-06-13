# 灵集AI V2.0 — 智能创作助手升级方案

> 版本: V1.0
> 日期: 2026-06-09
> 状态: 需求分析 & 架构设计

---

## 一、项目背景

### 1.1 现状

灵集当前 AI 助手（`src/app/api/ai/chat/route.ts`）本质是一个**无状态对话机器人**：

- 意图识别 → 选 Prompt 模板 → 调 LLM → 返回文本
- 10 个硬编码的 Prompt 模块（写作/知识/生活/编程/法律等）
- 对话历史仅保留 7 天（`chat_messages` 表，cron 清理）
- 生图/生视频走兜底逻辑，非函数调用模式
- 每次对话是全新的，不记得用户是谁、做过什么

### 1.2 目标

将灵集 AI 从"工具型对话机器人"升级为**有记忆、懂用户、可扩展的智能创作合伙人**。

参考架构：Hermes Agent（Nous Research）的记忆/Skills/Tools 体系，适配到灵集的多用户 Web 场景。

### 1.3 核心设计原则

| 原则 | 说明 |
|------|------|
| 多用户隔离 | 记忆/灵感库/技能均按 user_id 隔离，Supabase RLS 强制 |
| 渐进式加载 | Skills 采用 Hermes 的渐进披露模式（元数据 → 完整指令 → 关联文件） |
| 可插拔 | 记忆/Skills/知识库均为可替换模块，Provider 接口统一 |
| 知识优先 | 检索优先级：个人灵感库 → 公共知识库 → 联网搜索 |
| 兼容现有 | 不改动现有 `content_items`/`chat_sessions`/`chat_messages` 表结构 |

---

## 二、能力全景图

### 2.1 改造后的用户视角

```
用户打开灵集 AI：

第1天：你："我是做母婴赛道的，主要做小红书和视频号"
      它：记住（写入 user_memories）
      它：根据你的账号类型推荐"小红书文案""口播脚本"两个技能
      你：安装"小红书文案"技能

第7天：你："帮我写个产品种草"
      它：（自动加载你的记忆：母婴赛道、小红书）
      它：（自动加载已安装的"小红书文案"技能）
      它：（搜索你的灵感库：找到3条相关素材）
      它：（搜索公共知识库：小红书美妆类爆款结构）
      它：生成一篇母婴语气、小红书格式的种草文案

第14天：你："我上次收藏那个春季过敏的视频，帮我改成公众号文章"
      它：（语义搜索灵感库：找到3月15日的视频）
      它：（加载记忆：公众号文章需要正式语气、加免责声明）
      它：（搜索公共知识库：医疗健康类合规风险提示）
      它：生成适配公众号格式的科普文章

第21天：早上打开灵集
      它："婴童防晒话题在小红书涨了200%搜索量，
           你3月份收藏过一篇防晒成分分析，
           我准备了3个切入角度，要不要趁热度出一期？"
```

### 2.2 能力清单

| 编号 | 能力 | 描述 | 优先级 |
|------|------|------|--------|
| C1 | 用户记忆 | 持久化用户画像、偏好、创作风格、历史 | P0 |
| C2 | 灵感库语义搜索 | 用自然语言搜索个人灵感库 | P0 |
| C3 | 公共知识库 | 平台级可检索知识，创作者集体智慧 | P1 |
| C4 | 联网搜索回退 | 知识库无结果时自动联网 | P0 |
| C5 | Skills 系统 | 可安装/创建/调用的技能，支持 Skill Hub | P0 |
| C6 | 对话持久化 | 当前聊天历史改为永久保留 | P0 |
| C7 | 会话搜索 | 搜索历史对话内容 | P1 |
| C8 | 上下文自动压缩 | 长对话自动摘要压缩，保留关键信息 | P2 |
| C9 | 主动建议 | 热点+灵感库+用户画像 → 主动推荐选题 | P2 |
| C10 | 跨平台内容适配 | 同一内容自动转换小红书/公众号/抖音格式 | P2 |
| C11 | 内容合规提醒 | 公共知识库标记风险，生成时自动提示 | P3 |
| C12 | 子 Agent 委托 | 复杂任务拆分给子 Agent 并行处理 | P3 |

---

## 三、架构设计

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                    灵集 AI 助手 V2.0                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  用户输入                                                 │
│     │                                                    │
│     ▼                                                    │
│  ┌─────────────────────────┐                            │
│  │  意图识别 (已有)          │                            │
│  │  detectIntent()         │                            │
│  └───────────┬─────────────┘                            │
│              │                                            │
│              ▼                                            │
│  ┌─────────────────────────────────┐                    │
│  │  上下文组装流水线 (新增)          │                    │
│  │  ContextPipeline               │                    │
│  │  ┌─────────────────────────┐   │                    │
│  │  │ 1. 记忆检索             │   │                    │
│  │  │ 2. 灵感库语义搜索        │   │                    │
│  │  │ 3. 公共知识库搜索        │   │                    │
│  │  │ 4. 联网搜索回退          │   │                    │
│  │  │ 5. 对话历史加载          │   │                    │
│  │  └─────────────────────────┘   │                    │
│  └───────────┬─────────────────────┘                    │
│              │                                            │
│              ▼                                            │
│  ┌─────────────────────────────────┐                    │
│  │  技能系统 (新增)                 │                    │
│  │  SkillRegistry                 │                    │
│  │  ┌─────────────────────────┐   │                    │
│  │  │ 匹配已安装技能            │   │                    │
│  │  │ 加载技能指令到 Prompt     │   │                    │
│  │  │ 函数调用 → 执行工具       │   │                    │
│  │  └─────────────────────────┘   │                    │
│  └───────────┬─────────────────────┘                    │
│              │                                            │
│              ▼                                            │
│  ┌─────────────────────────────────┐                    │
│  │  AI 模型调用 (已有，增强)         │                    │
│  │  DeepSeek / Qwen / Doubao       │                    │
│  │  + 函数调用 (Function Calling)   │                    │
│  └───────────┬─────────────────────┘                    │
│              │                                            │
│              ▼                                            │
│  ┌─────────────────────────────────┐                    │
│  │  后处理 (新增)                   │                    │
│  │  ┌───────┬──────────┐          │                    │
│  │  │记忆更新│消息持久化 │ 结果渲染  │                    │
│  │  └───────┴──────────┘          │                    │
│  └─────────────────────────────────┘                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 模块划分

```
src/lib/assistant/              ← 新建：助手核心引擎
├── index.ts                    ← 统一导出
├── types.ts                    ← 类型定义
├── pipeline.ts                 ← 上下文组装流水线
├── intent.ts                   ← 意图识别（从 route.ts 迁移）
├── prompts.ts                  ← Prompt 模板（从 route.ts 迁移）
├── memory/                     ← 记忆子系统
│   ├── provider.ts             ← MemoryProvider 接口
│   ├── manager.ts              ← MemoryManager 管理器
│   ├── builtin-provider.ts     ← 内置记忆 Provider（Supabase）
│   └── extractor.ts            ← 从对话中提取记忆
├── knowledge/                  ← 知识库子系统
│   ├── provider.ts             ← KnowledgeProvider 接口
│   ├── manager.ts              ← KnowledgeManager（编排多个知识源）
│   ├── inspiration-provider.ts ← 个人灵感库 Provider
│   ├── public-provider.ts      ← 公共知识库 Provider
│   └── web-search-provider.ts  ← 联网搜索 Provider（回退）
├── skills/                     ← 技能子系统
│   ├── registry.ts             ← 技能注册表
│   ├── matcher.ts              ← 意图→技能匹配
│   ├── executor.ts             ← 技能执行器
│   └── hub.ts                  ← 技能市场（GitHub API）
└── context/                    ← 上下文子系统
    ├── references.ts           ← 上下文引用解析
    └── compressor.ts           ← 长对话压缩
```

---

## 四、数据库设计

### 4.1 新建表

```sql
-- ============================================================
-- 1. 启用 pgvector 扩展
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. 用户记忆表
-- ============================================================
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('profile', 'preference', 'fact', 'workflow', 'general')),
  key TEXT,                              -- 记忆键（可选，用于去重/替换）
  value TEXT NOT NULL,                   -- 记忆内容
  importance INTEGER DEFAULT 1           -- 重要性 1-10
    CHECK (importance BETWEEN 1 AND 10),
  source_session_id UUID,                -- 来源会话（NULL=手动创建）
  embedding vector(1536),                -- OpenAI text-embedding-3-small
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_user ON user_memories(user_id);
CREATE INDEX idx_memories_category ON user_memories(user_id, category);
-- pgvector IVFFlat 索引（定期重建）
CREATE INDEX idx_memories_embedding ON user_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
-- RLS: 用户只能读写自己的记忆

-- ============================================================
-- 3. 灵感库向量索引表（关联 content_items）
-- ============================================================
CREATE TABLE inspiration_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding vector(1536),
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_id)
);

CREATE INDEX idx_insp_embed_user ON inspiration_embeddings(user_id);
CREATE INDEX idx_insp_embed_vector ON inspiration_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE inspiration_embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. 公共知识库表
-- ============================================================
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,                          -- 分类：创作技巧/平台规则/案例/工具
  tags TEXT[],
  source TEXT,                            -- 来源说明
  source_url TEXT,                        -- 原始链接（可选）
  embedding vector(1536),
  visibility TEXT DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal')),
  created_by UUID REFERENCES users(id),
  usage_count INTEGER DEFAULT 0,
  helpful_score REAL DEFAULT 0,           -- 用户反馈评分
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_category ON knowledge_base(category);
CREATE INDEX idx_kb_visibility ON knowledge_base(visibility);
CREATE INDEX idx_kb_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
-- RLS: public 条目所有人可读，internal 仅管理员可读

-- ============================================================
-- 5. 技能注册表
-- ============================================================
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- 唯一标识符（slug）
  display_name TEXT NOT NULL,             -- 显示名称
  description TEXT NOT NULL,              -- 简短描述（≤256字）
  category TEXT,                          -- 分类
  tags TEXT[],
  prompt_template TEXT NOT NULL,          -- 注入到 system prompt 的指令
  parameter_schema JSONB,                 -- 参数 JSON Schema
  linked_files JSONB,                     -- 关联文件列表 {references: [], templates: [], assets: []}
  linked_content JSONB,                   -- 关联文件内容（按需加载）
  version TEXT DEFAULT '1.0.0',
  author_id UUID REFERENCES users(id),
  visibility TEXT DEFAULT 'private'
    CHECK (visibility IN ('private', 'public', 'official')),
  install_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skills_visibility ON skills(visibility);
CREATE INDEX idx_skills_category ON skills(category);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. 用户技能关联表
-- ============================================================
CREATE TABLE user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  custom_config JSONB,                    -- 用户自定义配置
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX idx_user_skills_user ON user_skills(user_id);

ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. 对话记忆（延长的消息历史 + 向量搜索）
-- ============================================================
-- chat_messages 表已有，不做修改
-- 新增向量索引表用于回搜索历史对话
CREATE TABLE chat_message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  embedding vector(1536),
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id)
);

CREATE INDEX idx_chat_embed_user ON chat_message_embeddings(user_id);
CREATE INDEX idx_chat_embed_session ON chat_message_embeddings(session_id);

ALTER TABLE chat_message_embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. 技能调用日志（用于分析和改进）
-- ============================================================
CREATE TABLE skill_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  input_params JSONB,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  result_summary TEXT,
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skill_inv_user ON skill_invocations(user_id);
CREATE INDEX idx_skill_inv_skill ON skill_invocations(skill_id);

-- ============================================================
-- 9. 向量搜索函数
-- ============================================================
CREATE OR REPLACE FUNCTION search_user_memories(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold REAL DEFAULT 0.7
) RETURNS TABLE(
  id UUID,
  category TEXT,
  value TEXT,
  importance INTEGER,
  similarity REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.category,
    m.value,
    m.importance,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM user_memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY m.importance DESC, m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION search_inspirations(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold REAL DEFAULT 0.7
) RETURNS TABLE(
  content_id UUID,
  title TEXT,
  original_text TEXT,
  ai_summary TEXT,
  type TEXT,
  similarity REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.original_text,
    c.ai_summary,
    c.type,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM inspiration_embeddings e
  JOIN content_items c ON c.id = e.content_id
  WHERE e.user_id = p_user_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold REAL DEFAULT 0.7
) RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  source TEXT,
  similarity REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    kb.source,
    1 - (kb.embedding <=> p_query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.visibility = 'public'
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY kb.helpful_score DESC, kb.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;
```

### 4.2 修改现有表

```sql
-- chat_messages：移除 7 天过期清理（cron job 停止清理）
-- 替代方案：超过 30 天的消息归档到 chat_message_archives 表

-- chat_sessions：增加字段
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS
  summary TEXT;               -- AI 生成的会话摘要
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS
  skill_ids UUID[];           -- 该会话中使用的技能
```

---

## 五、API 设计

### 5.1 增强对话接口

```
POST /api/ai/chat
  请求: {
    content: string,
    session_id?: string,
    images?: string[],
    videos?: string[],
    documents?: string[],
    model?: string,
    // 新增
    skills_enabled?: string[],     // 启用的技能（默认全部已安装）
    skip_knowledge?: boolean,      // 跳过知识库搜索
  }
  响应: {
    success: true,
    response: string,              // AI 回复
    summary: string,
    tags: string[],
    suggestions: string[],
    // 新增
    context_used: {                // 用到的上下文信息
      memories_used: number,       // 检索到的记忆条数
      inspirations_used: number,   // 检索到的灵感条数
      knowledge_used: number,      // 检索到的知识库条数
      web_search_used: boolean,    // 是否使用了联网搜索
      skills_used: string[],       // 用到的技能名称
    },
    new_memories: number,          // 新创建的记忆条数
    session_id: string,
  }
```

### 5.2 技能管理

```
GET    /api/skills               → 技能列表（公共/已安装）
GET    /api/skills/:id           → 技能详情
POST   /api/skills/:id/install   → 安装技能
POST   /api/skills/:id/uninstall → 卸载技能
POST   /api/skills               → 创建新技能
PUT    /api/skills/:id           → 更新技能
DELETE /api/skills/:id           → 删除技能
GET    /api/skills/hub/search    → 搜索技能市场
POST   /api/skills/hub/install   → 从市场安装
```

### 5.3 记忆管理

```
GET    /api/memories              → 获取当前用户记忆列表
POST   /api/memories              → 手动创建记忆
PUT    /api/memories/:id          → 更新记忆
DELETE /api/memories/:id          → 删除记忆
GET    /api/memories/search?q=xx  → 搜索记忆
```

### 5.4 知识库管理

```
GET    /api/knowledge-base/search?q=xx  → 语义搜索公共知识库
POST   /api/knowledge-base              → 添加知识条目
GET    /api/knowledge-base/:id          → 查看知识详情
POST   /api/knowledge-base/:id/feedback → 反馈（有用/无用）
```

### 5.5 对话管理（增强）

```
GET    /api/chat/search?q=xx        → 搜索历史对话
GET    /api/chat/sessions/:id/summary → 获取会话摘要
```

---

## 六、核心接口定义

### 6.1 MemoryProvider 接口

```typescript
// src/lib/assistant/memory/provider.ts

interface MemoryProvider {
  name: string;
  isAvailable(): boolean;
  initialize(userId: string): Promise<void>;

  // 核心操作
  prefetch(query: string, embedding: number[]): Promise<MemoryEntry[]>;
  save(entry: Omit<MemoryEntry, 'id'>): Promise<MemoryEntry>;
  update(id: string, entry: Partial<MemoryEntry>): Promise<void>;
  delete(id: string): Promise<void>;

  // 生命周期
  onSessionEnd(sessionId: string, messages: ChatMessage[]): Promise<void>;
  shutdown(): Promise<void>;

  // 可选：system prompt 块
  systemPromptBlock?(): string;
}
```

### 6.2 KnowledgeProvider 接口

```typescript
// src/lib/assistant/knowledge/provider.ts

interface KnowledgeProvider {
  name: string;
  priority: number;  // 越小越优先

  isAvailable(): boolean;
  search(query: string, embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]>;
}

interface SearchOptions {
  limit: number;
  similarityThreshold: number;
  userId?: string;  // 个人知识源需要 userId
}
```

### 6.3 Skill 接口

```typescript
// src/lib/assistant/skills/registry.ts

interface Skill {
  name: string;
  displayName: string;
  description: string;
  promptTemplate: string;
  parameterSchema?: JSONSchema;
  linkedFiles?: Record<string, string[]>;

  // 运行时
  match(intent: DetectedIntent, userInput: string): number;  // 0-1 匹配分
  execute(params: Record<string, unknown>, context: SkillContext): Promise<SkillResult>;
}
```

---

## 七、context_pipeline 流程图

```
用户输入 + 意图
       │
       ▼
┌──────────────────┐
│ 1. 并行检索        │
│                    │
│  ┌──────────────┐ │  生成 query embedding (1536d)
│  │ 记忆检索      │ │  → search_user_memories()
│  │ 灵感库语义搜索│ │  → search_inspirations()
│  │ 公共知识库搜索│ │  → search_knowledge_base()
│  └──────────────┘ │
│   结果合并 & 去重   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. 回退决策        │
│                    │
│  知识库结果 ≥ 3?   │── 是 → 跳过联网搜索
│  否 → 执行联网搜索  │ → callDeepSeek(enableSearch: true)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. 组装 Prompt     │
│                    │
│  <memory-context>  │  记忆（加防注入标签）
│  <knowledge>       │  灵感库 + 知识库 + 搜索结果
│  <skills>          │  已安装 & 匹配的技能指令
│  <history>         │  对话历史
│  <user_input>      │  当前用户输入
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. 技能匹配 & 执行 │
│                    │
│  意图 → 匹配技能    │
│  AI 函数调用        │ → 执行技能逻辑
│  结果回注到 Prompt  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. LLM 调用       │
│  函数调用模式      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 6. 后处理          │
│  提取新记忆        │
│  持久化消息        │
│  更新会话摘要      │
└──────────────────┘
```

---

## 八、实现阶段

### Phase 1：基础设施（1-2 周）

| 任务 | 产出 |
|------|------|
| 启用 pgvector | 数据库扩展 + IVFFlat 索引 |
| 创建新表 | user_memories, knowledge_base, inspiration_embeddings, skills, user_skills, chat_message_embeddings |
| 迁移现有代码 | 把 intent.ts + prompts.ts 从 route.ts 拆出 |
| MemoryProvider 基础设施 | 接口 + BuiltinProvider + Manager |
| 对话历史永久保留 | 停止 cron 清理，chat_sessions 增加 summary 字段 |

### Phase 2：记忆 & 知识检索（2-3 周）

| 任务 | 产出 |
|------|------|
| Embedding 服务 | 接入 OpenAI text-embedding-3-small 或本地模型 |
| 灵感库索引 | 为 content_items 创建向量嵌入 API + 批量索引脚本 |
| 上下文组装流水线 | ContextPipeline 串联记忆→灵感→知识库→联网搜索 |
| 记忆自动提取 | 从对话中提取用户偏好/事实，写入 user_memories |
| 系统 Prompt 模板 | memory-context + knowledge-context + skill-context 标签格式 |

### Phase 3：技能系统（2-3 周）

| 任务 | 产出 |
|------|------|
| Skill Registry | 注册表 + 匹配器 + 执行器 |
| 技能 CRUD API | 创建/更新/删除/列表 |
| 技能安装/卸载 | user_skills 关联 |
| 函数调用（Function Calling） | 扩展 LLM 调用支持 tool_choice |
| 内置技能 | 把现有 10 个 Prompt 模块转为 Skill（写作/知识/生活/编程等） |
| 技能市场基础 | GitHub API 搜索 + 安装 |

### Phase 4：增强功能（2-3 周）

| 任务 | 产出 |
|------|------|
| 会话搜索 | FTS 或 pgvector 搜索历史消息 |
| 上下文压缩 | 长对话自动摘要，保护记忆不丢失 |
| 用户画像页面 | 展示 AI 对用户的认知，支持手动编辑 |
| 技能创建向导 | 前端引导式创建技能 |

### Phase 5：高级功能（后续）

| 任务 | 产出 |
|------|------|
| 主动建议引擎 | 热点 + 灵感 + 画像 → 选题推荐 |
| 跨平台适配 | 小红书 ↔ 公众号 ↔ 抖音格式转换 |
| Skill Hub 完整版 | 社区发布/评价/版本管理 |
| 子 Agent 委托 | 复杂任务拆分 |

---

## 九、技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 向量数据库 | Supabase pgvector | 无需额外部署，与现有 Postgres 统一 |
| Embedding | OpenAI text-embedding-3-small (1536d) | 中文效果好，3-small 性价比高 |
| 函数调用 | DeepSeek/千问 Function Calling | 复用现有模型，均支持 tool_choice |
| Skills 格式 | Markdown + YAML Frontmatter | 与 Hermes / agentskills.io 兼容 |
| 联网搜索 | DeepSeek enableSearch (已有) | 无需额外 API |
| 前端框架 | Next.js 14 (已有) | 无需变更 |

---

## 十、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| pgvector 性能 | 向量数超 10 万后查询变慢 | IVFFlat 索引 + 定期 REINDEX；后期考虑 pgvector HNSW |
| Embedding 成本 | API 调用量大 | 批量索引 + 缓存已索引内容；本地模型备选 |
| 记忆污染 | AI 记忆了错误/有害信息 | 用户可查看/编辑/删除记忆；importance 自动衰减 |
| 技能质量 | 公有技能可能包含低质量/恶意 Prompt | 前置审核 + 用户举报 + quarantine 机制 |
| 上下文膨胀 | 检索内容太多超出 token 限制 | 压缩旧消息 + 截断低相关性结果 + priority 排序 |
| 隐私泄露 | 记忆/灵感数据隔离不当 | Supabase RLS 强制隔离 + 审计日志 |

---

## 附录：与 Hermes Agent 对应关系

| Hermes 组件 | 灵集对应实现 |
|-------------|-------------|
| `agent/memory_manager.py` | `src/lib/assistant/memory/manager.ts` |
| `agent/memory_provider.py` | `src/lib/assistant/memory/provider.ts` |
| `tools/memory_tool.py` (MEMORY.md/USER.md) | `builtin-provider.ts` + `user_memories` 表 |
| `tools/skills_tool.py` (skills_list/skill_view) | `src/lib/assistant/skills/registry.ts` |
| `tools/skills_hub.py` (GitHub 安装) | `src/lib/assistant/skills/hub.ts` |
| `agent/context_compressor.py` | `src/lib/assistant/context/compressor.ts` |
| `agent/context_references.py` (@file/@url) | 灵集暂不需要文件引用，简化即可 |
| `hermes_state.py` (SessionDB + FTS5) | Supabase `chat_messages` + pgvector |
| `tools/registry.py` | 灵集已有 API Route，Skill 内部工具走函数调用 |
| `tools/web_tools.py` (Parallel/Firecrawl) | `web-search-provider.ts` (DeepSeek enableSearch) |
| `tools/terminal_tool.py` | 灵集不需要终端执行 |
| `gateway/` (多平台) | 灵集已有 Web + Capacitor，多平台是可选项 |
