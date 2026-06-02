-- content_items 增加 lifecycle_status 字段 (V2.0.1)
-- 用途：把"创作态"和"分发态"分离
--   draft = 刚生成未发布
--   ready = 准备分发
--   distributed = 已发布到至少一个平台
--   archived = 归档
-- V2.0.2 的 publications 表会按 content_id 关联并自动回填 distributed

-- 1. 新增字段
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'draft';

-- 2. CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_lifecycle_status_check'
  ) THEN
    ALTER TABLE content_items
      ADD CONSTRAINT content_items_lifecycle_status_check
      CHECK (lifecycle_status IN ('draft', 'ready', 'distributed', 'archived'));
  END IF;
END$$;

-- 3. 部分索引：按用户筛"待分发"内容
CREATE INDEX IF NOT EXISTS idx_content_items_lifecycle
  ON content_items(user_id, lifecycle_status, created_at DESC)
  WHERE lifecycle_status IN ('draft', 'ready');

-- 4. 注释
COMMENT ON COLUMN content_items.lifecycle_status IS '内容生命周期：draft/ready/distributed/archived，V2.0.2 publications 自动回填 distributed';
