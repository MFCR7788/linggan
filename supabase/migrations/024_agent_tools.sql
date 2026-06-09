-- 灵集 — Agent 多轮对话系统
-- agent_executions: 记录每次 Agent 对话执行
-- 日期: 2026-06-10

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  input_content TEXT NOT NULL,
  iterations INTEGER DEFAULT 0,
  tools_used TEXT[] DEFAULT '{}',
  total_tokens_used INTEGER DEFAULT 0,
  model_used TEXT,
  conversational_mode BOOLEAN DEFAULT false,
  final_response TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_user ON agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_session ON agent_executions(session_id);

ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS is_agent_conversation BOOLEAN DEFAULT false;
