-- AI 任务队列表升级 (V2.0.1)
-- 把 ai_tasks 从"日志表"改造为"真任务队列"：
--   1) 支持 batch 聚合（前端按 batchId 查进度）
--   2) 支持 worker 抢占（worker_id + scheduled_for + priority）
--   3) 支持重试（retry_count + max_retries + error_code）
--   4) 支持进度上报（progress 0-100 + estimated_seconds）

-- 1. 新增字段
ALTER TABLE ai_tasks
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES ai_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress SMALLINT NOT NULL DEFAULT 0
    CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries SMALLINT NOT NULL DEFAULT 3
    CHECK (max_retries BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 5
    CHECK (priority BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS estimated_seconds INTEGER;

-- 2. 扩展 status 枚举（增加 'cancelled'）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_tasks_status_check'
  ) THEN
    ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_status_check;
  END IF;
END$$;

ALTER TABLE ai_tasks
  ADD CONSTRAINT ai_tasks_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- 3. 部分索引：worker 抢占用 (status, priority, scheduled_for)
CREATE INDEX IF NOT EXISTS idx_ai_tasks_pending
  ON ai_tasks(status, priority, scheduled_for)
  WHERE status IN ('pending', 'processing');

-- 4. 部分索引：按 batch 查询进度
CREATE INDEX IF NOT EXISTS idx_ai_tasks_batch
  ON ai_tasks(batch_id)
  WHERE batch_id IS NOT NULL;

-- 5. 普通索引：用户最近任务
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_recent
  ON ai_tasks(user_id, created_at DESC);

-- 6. 注释
COMMENT ON COLUMN ai_tasks.batch_id IS '同批次任务共享，前端按 batchId 聚合展示进度';
COMMENT ON COLUMN ai_tasks.parent_task_id IS '子任务链（为后续拆分子任务预留）';
COMMENT ON COLUMN ai_tasks.progress IS '0-100，前端进度条用';
COMMENT ON COLUMN ai_tasks.scheduled_for IS 'worker 抢占排序：早的时间优先';
COMMENT ON COLUMN ai_tasks.worker_id IS '抢占该任务的 worker 标识，用于超时回收';
COMMENT ON COLUMN ai_tasks.priority IS '1-10 数字越小越优先，默认 5';
COMMENT ON COLUMN ai_tasks.estimated_seconds IS '预估时长，前端 ETA 计算用';
