-- 018: 新增 prompt 字段 — 保存 AI 生成时使用的最终 prompt，用于"做同款"回填
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS prompt TEXT;
COMMENT ON COLUMN content_items.prompt IS 'AI 生成时使用的最终 prompt，用于做同款回填';
