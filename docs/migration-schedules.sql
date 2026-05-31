-- 日程管理迁移 SQL
-- 为灵感助手中的日程功能创建专门的日程表

-- 1. 创建日程表
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  color TEXT DEFAULT '#3B82F6',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  remind_before INTEGER DEFAULT 30, -- 提前多少分钟提醒
  source_content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON schedules(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON schedules(user_id, scheduled_at DESC);

-- 3. 启用 RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略
CREATE POLICY "用户只能管理自己的日程" ON schedules
  FOR ALL USING (auth.uid() = user_id);

-- 5. 自动更新 updated_at 触发器
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
