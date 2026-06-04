-- Workflow Sessions: 多步骤 AI 创作流水线
-- 每个 session 对应一次"推荐组合"的完整执行
-- accumulated_handoff 替代 URL 参数传递，持久化每步产出

CREATE TABLE IF NOT EXISTS workflow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  combo_id TEXT NOT NULL,
  account_type TEXT,
  title TEXT,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  step_results JSONB DEFAULT '[]'::jsonb,
  accumulated_handoff JSONB DEFAULT '{}'::jsonb,
  combo_snapshot JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wf_sessions_user_id ON workflow_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_wf_sessions_status ON workflow_sessions(status);
CREATE INDEX IF NOT EXISTS idx_wf_sessions_user_status ON workflow_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_sessions_updated ON workflow_sessions(updated_at DESC);

ALTER TABLE workflow_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户管理自己的workflow会话" ON workflow_sessions
  FOR ALL USING (auth.uid() = user_id);

-- auto updated_at
CREATE TRIGGER update_wf_sessions_updated_at BEFORE UPDATE ON workflow_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 灵感库关联工作流会话
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS workflow_session_id UUID
  REFERENCES workflow_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_wf_session
  ON content_items(workflow_session_id);
