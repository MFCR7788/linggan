-- 灵感库新增 audio 类型（音频文件）
-- upload/inspiration API 已将 audio/mpeg, audio/wav 映射为 'audio' 类型
-- 但 DB CHECK 约束未包含 'audio'，导致音频上传后入库失败

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_type_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_type_check
  CHECK (type IN ('text', 'voice', 'image', 'video', 'link', 'audio'));
