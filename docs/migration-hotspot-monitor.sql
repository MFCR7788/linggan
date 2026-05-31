-- 热点监控迁移 SQL
-- 补充关键词库表和相关字段

-- 1. 全局关键词库（去重）
CREATE TABLE IF NOT EXISTS keyword_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL UNIQUE,
  category TEXT,
  user_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 用户关键词订阅关联表（多对多）
ALTER TABLE monitor_keywords ADD COLUMN IF NOT EXISTS keyword_library_id UUID REFERENCES keyword_library(id) ON DELETE SET NULL;
ALTER TABLE monitor_keywords ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE monitor_keywords ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;

-- 3. 更新 hot_items 增加字段
ALTER TABLE hot_items ADD COLUMN IF NOT EXISTS keyword_matched BOOLEAN DEFAULT false;
ALTER TABLE hot_items ADD COLUMN IF NOT EXISTS matched_terms TEXT[];

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_keyword_library_text ON keyword_library(text);
CREATE INDEX IF NOT EXISTS idx_keyword_library_category ON keyword_library(category);
CREATE INDEX IF NOT EXISTS idx_keyword_library_user_count ON keyword_library(user_count DESC);
CREATE INDEX IF NOT EXISTS idx_hot_items_relevance_score ON hot_items(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_hot_items_captured_at ON hot_items(captured_at DESC);

-- 5. 启用 keyword_library 的 RLS
ALTER TABLE keyword_library ENABLE ROW LEVEL SECURITY;

-- 6. 关键词库公开可读（用于用户搜索和订阅）
CREATE POLICY "关键词库公开可读" ON keyword_library
  FOR SELECT USING (true);

-- 7. 关键词库仅管理员可写
CREATE POLICY "关键词库管理员写" ON keyword_library
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM auth.users));
CREATE POLICY "关键词库管理员更新" ON keyword_library
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM auth.users));

-- 8. 创建自动更新 updated_at 触发器
CREATE TRIGGER update_keyword_library_updated_at BEFORE UPDATE ON keyword_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
