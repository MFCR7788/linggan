-- 033: Prompt Feedback & Optimization Metrics
-- Date: 2026-06-23

-- 提示词反馈表：记录用户对优化后提示词产出结果的评价
CREATE TABLE IF NOT EXISTS prompt_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,

  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT,
  framework_used TEXT,
  optimization_confidence REAL,

  rating SMALLINT NOT NULL CHECK (rating IN (1, -1)),
  feedback_tags TEXT[],
  comment TEXT,

  tool_calls_used TEXT[],
  response_snippet TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_user ON prompt_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_session ON prompt_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_pf_rating ON prompt_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_pf_framework ON prompt_feedback(framework_used);
CREATE INDEX IF NOT EXISTS idx_pf_created ON prompt_feedback(created_at);

ALTER TABLE prompt_feedback ENABLE ROW LEVEL SECURITY;

-- 聚合指标表：按框架+行业统计成功率
CREATE TABLE IF NOT EXISTS prompt_optimization_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id TEXT NOT NULL,
  framework_name TEXT NOT NULL,
  industry TEXT,
  task_type TEXT,

  total_optimizations INTEGER DEFAULT 0,
  total_feedback INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,
  negative_feedback INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.5,

  avg_confidence REAL DEFAULT 0,
  top_feedback_tags TEXT[],

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(framework_id, industry, task_type)
);

CREATE INDEX IF NOT EXISTS idx_pom_framework ON prompt_optimization_metrics(framework_id);
CREATE INDEX IF NOT EXISTS idx_pom_success ON prompt_optimization_metrics(success_rate DESC);
