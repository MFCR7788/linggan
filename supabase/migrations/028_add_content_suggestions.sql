-- 灵集 AI V2.0 — 内容选题建议表
-- 用于 cron 主动推送选题建议给用户
-- 日期: 2026-06-13

CREATE TABLE IF NOT EXISTS content_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposals JSONB NOT NULL DEFAULT '[]',
  focus_area TEXT,
  account_type TEXT,
  hotspot_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user ON content_suggestions(user_id, generated_at DESC);

ALTER TABLE content_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_suggestions_self ON content_suggestions;
CREATE POLICY content_suggestions_self ON content_suggestions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
