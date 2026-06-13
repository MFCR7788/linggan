-- 灵集 AI V2.0 — RLS 策略补全
-- 为 019_ai_assistant_v2.sql 创建的表添加 RLS 策略
-- 现有代码全部使用 createAdminClient()（service_role），此迁移为防御纵深
-- 日期: 2026-06-13

-- ============================================================
-- 1. user_memories — 用户只能访问自己的记忆
-- ============================================================
DROP POLICY IF EXISTS user_memories_self ON user_memories;
CREATE POLICY user_memories_self ON user_memories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. inspiration_embeddings — 用户只能访问自己的向量
-- ============================================================
DROP POLICY IF EXISTS inspiration_embeddings_self ON inspiration_embeddings;
CREATE POLICY inspiration_embeddings_self ON inspiration_embeddings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. knowledge_base — public 条目所有人可读；创建者可管理自己的
-- ============================================================
DROP POLICY IF EXISTS kb_public_select ON knowledge_base;
CREATE POLICY kb_public_select ON knowledge_base
  FOR SELECT
  USING (visibility = 'public');

DROP POLICY IF EXISTS kb_owner_manage ON knowledge_base;
CREATE POLICY kb_owner_manage ON knowledge_base
  FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- ============================================================
-- 4. skills — public + official 所有人可读
--    (写入通过 service_role / API 控制)
-- ============================================================
DROP POLICY IF EXISTS skills_public_select ON skills;
CREATE POLICY skills_public_select ON skills
  FOR SELECT
  USING (visibility IN ('public', 'official'));

-- ============================================================
-- 5. user_skills — 用户只能管理自己的技能关联
-- ============================================================
DROP POLICY IF EXISTS user_skills_self ON user_skills;
CREATE POLICY user_skills_self ON user_skills
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. chat_message_embeddings — 用户只能访问自己的
-- ============================================================
DROP POLICY IF EXISTS chat_embed_self ON chat_message_embeddings;
CREATE POLICY chat_embed_self ON chat_message_embeddings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. skill_invocations — 之前未启用 RLS，先启用再加策略
-- ============================================================
ALTER TABLE skill_invocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skill_inv_self ON skill_invocations;
CREATE POLICY skill_inv_self ON skill_invocations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. agent_executions — 补充 RLS（024 创建但未加）
-- ============================================================
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_exec_self ON agent_executions;
CREATE POLICY agent_exec_self ON agent_executions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
