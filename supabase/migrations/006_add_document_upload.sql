-- 文档上传与 AI 抽取支持
-- 灵感库支持上传 PDF/DOCX/TXT/MD，落地归 type='text'，保留原始文件作为附件

-- 1. 新增字段
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS original_file_url TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS original_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS original_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT,
  ADD COLUMN IF NOT EXISTS extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS extracted_chars INTEGER;

-- 2. 抽取状态枚举约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_extraction_status_check'
  ) THEN
    ALTER TABLE content_items
      ADD CONSTRAINT content_items_extraction_status_check
      CHECK (extraction_status IS NULL OR extraction_status IN
        ('pending', 'extracting', 'extracted', 'failed', 'skipped'));
  END IF;
END$$;

-- 3. 部分索引：仅覆盖需要追踪的文档类记录
CREATE INDEX IF NOT EXISTS idx_content_items_extraction_status
  ON content_items(user_id, extraction_status)
  WHERE extraction_status IS NOT NULL;

-- 4. 复合索引：按用户和创建时间查文档类记录
CREATE INDEX IF NOT EXISTS idx_content_items_user_extraction_created
  ON content_items(user_id, created_at DESC)
  WHERE original_file_url IS NOT NULL;
