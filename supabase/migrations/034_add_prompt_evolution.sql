-- 034: Prompt Evolution — 学习模板 + 进化日志
-- Date: 2026-06-23

-- 学习模板表：从成功反馈中自动归纳的行业提示词模板
CREATE TABLE IF NOT EXISTS learned_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '通用',
  task_type TEXT NOT NULL DEFAULT 'general',
  template TEXT NOT NULL,
  sample_count INTEGER DEFAULT 0,
  parent_framework_id TEXT NOT NULL,

  total_feedback INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(parent_framework_id, industry, task_type)
);

CREATE INDEX IF NOT EXISTS idx_lpt_industry ON learned_prompt_templates(industry);
CREATE INDEX IF NOT EXISTS idx_lpt_framework ON learned_prompt_templates(parent_framework_id);
CREATE INDEX IF NOT EXISTS idx_lpt_samples ON learned_prompt_templates(sample_count DESC);

-- 进化日志表：记录每次权重调整、关键词更新、模板学习
CREATE TABLE IF NOT EXISTS prompt_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'weight_adjust', 'keyword_update', 'template_learn',
    'self_optimize_start', 'self_optimize_end', 'report_generate'
  )),
  details JSONB,
  affected_frameworks TEXT[],
  summary TEXT,

  triggered_by TEXT DEFAULT 'cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pel_type ON prompt_evolution_log(event_type);
CREATE INDEX IF NOT EXISTS idx_pel_created ON prompt_evolution_log(created_at);
