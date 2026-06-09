-- 灵集 AI V2.0 — 智能创作助手升级
-- 启用 pgvector + 记忆/知识库/技能系统
-- 日期: 2026-06-09

-- ============================================================
-- 1. 启用 pgvector 扩展
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. 用户记忆表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('profile', 'preference', 'fact', 'workflow', 'general')),
  key TEXT,
  value TEXT NOT NULL,
  importance INTEGER DEFAULT 1
    CHECK (importance BETWEEN 1 AND 10),
  source_session_id UUID,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON user_memories(user_id, category);

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. 灵感库向量索引表
-- ============================================================
CREATE TABLE IF NOT EXISTS inspiration_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding vector(1536),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id)
);

CREATE INDEX IF NOT EXISTS idx_insp_embed_user ON inspiration_embeddings(user_id);

ALTER TABLE inspiration_embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. 公共知识库表
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  source TEXT,
  source_url TEXT,
  embedding vector(1536),
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 0,
  helpful_score REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_visibility ON knowledge_base(visibility);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. 技能注册表
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  prompt_template TEXT NOT NULL,
  parameter_schema JSONB,
  linked_files JSONB,
  linked_content JSONB,
  version TEXT DEFAULT '1.0.0',
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public', 'official')),
  install_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_visibility ON skills(visibility);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. 用户技能关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  custom_config JSONB,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);

ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. 对话消息向量索引
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  embedding vector(1536),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_embed_user ON chat_message_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_embed_session ON chat_message_embeddings(session_id);

ALTER TABLE chat_message_embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. 技能调用日志
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  input_params JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  result_summary TEXT,
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_inv_user ON skill_invocations(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_inv_skill ON skill_invocations(skill_id);

-- ============================================================
-- 9. 修改 chat_sessions 增加 summary 字段
-- ============================================================
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS skill_ids UUID[];

-- ============================================================
-- 10. 向量搜索函数
-- ============================================================

-- 搜索用户记忆
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
) LANGUAGE plpgsql STABLE AS $$
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

-- 搜索个人灵感库
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
) LANGUAGE plpgsql STABLE AS $$
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

-- 搜索公共知识库
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
) LANGUAGE plpgsql STABLE AS $$
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

-- 搜索历史对话
CREATE OR REPLACE FUNCTION search_chat_history(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold REAL DEFAULT 0.7
) RETURNS TABLE(
  message_id UUID,
  session_id UUID,
  content TEXT,
  type TEXT,
  created_at TIMESTAMPTZ,
  similarity REAL
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.session_id,
    cm.content,
    cm.type,
    cm.created_at,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM chat_message_embeddings e
  JOIN chat_messages cm ON cm.id = e.message_id
  WHERE e.user_id = p_user_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- 9. increment_skill_install RPC
-- ============================================================
CREATE OR REPLACE FUNCTION increment_skill_install(p_skill_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE skills SET install_count = install_count + 1 WHERE id = p_skill_id;
END;
$$;
