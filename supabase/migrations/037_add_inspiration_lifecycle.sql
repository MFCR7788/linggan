-- 灵感生命周期 + 智能排程字段
-- 日期: 2026-06-24

-- 1. 灵感表加字段
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ,       -- 最后操作时间（创建/排入日程/编辑）
  ADD COLUMN IF NOT EXISTS lifecycle TEXT DEFAULT 'seed'      -- 生命周期：seed→sprout→growing→bloom
    CHECK (lifecycle IN ('seed', 'sprout', 'growing', 'bloom')),
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER,        -- AI 估算耗时（分钟）
  ADD COLUMN IF NOT EXISTS required_resources TEXT[];         -- AI 估算所需资源：拍摄/设计/写作

-- 2. 索引：按空闲天数查询休眠灵感
CREATE INDEX IF NOT EXISTS idx_content_items_last_action
  ON content_items(user_id, last_action_at)
  WHERE status = 'active';

-- 3. 索引：按生命周期查询
CREATE INDEX IF NOT EXISTS idx_content_items_lifecycle
  ON content_items(user_id, lifecycle)
  WHERE status = 'active';

-- 4. 新建灵感时自动设置 last_action_at
-- 已有灵感的 last_action_at 回填为 created_at
UPDATE content_items SET last_action_at = created_at WHERE last_action_at IS NULL;

-- 5. 已有灵感默认生命周期回填
-- seed: 无 source_content_id 引用的日程
-- sprout: 有 source_content_id 引用但日程未完成
-- growing: 有 source_content_id 引用且日程完成
-- bloom: 已发布的成品
UPDATE content_items
SET lifecycle = CASE
  WHEN id IN (SELECT source_content_id FROM schedules WHERE source_content_id IS NOT NULL AND status = 'completed')
    THEN 'growing'
  WHEN id IN (SELECT source_content_id FROM schedules WHERE source_content_id IS NOT NULL AND status = 'pending')
    THEN 'sprout'
  ELSE 'seed'
END
WHERE lifecycle = 'seed';
