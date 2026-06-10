-- 为 chat_sessions 添加 metadata 字段，存储流程状态等扩展数据
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
