-- 灵集 — pgvector IVFFlat 索引
-- 为所有向量表添加近似检索索引，消除全表扫描
-- 日期: 2026-06-10

-- IVFFlat 将向量空间划分为 lists 个区域，查询时只扫描最近的 probe 个区域
-- lists 建议: 行数 < 100K → 100, 行数/1000 → 100-1000, sqrt(行数) → 100-4000
-- 当前数据量预估 < 10K 行，lists = 100 合理

-- 用户记忆表
CREATE INDEX IF NOT EXISTS idx_memories_embedding_ivfflat
  ON user_memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- 灵感库向量索引
CREATE INDEX IF NOT EXISTS idx_insp_embed_ivfflat
  ON inspiration_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- 公共知识库
CREATE INDEX IF NOT EXISTS idx_kb_embedding_ivfflat
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- 对话消息向量
CREATE INDEX IF NOT EXISTS idx_chat_embed_ivfflat
  ON chat_message_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
