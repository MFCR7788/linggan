-- 灵集 - Supabase 数据库 Schema
-- 版本: V1.0
-- 日期: 2026-05-21

-- ===============================================================
-- 1. 启用扩展
-- ===============================================================

-- 开启向量搜索支持 (如果需要)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ===============================================================
-- 2. 创建核心表
-- ===============================================================

-- 用户表（补充 auth.users 的用户信息）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  username TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 内容表（灵感库核心表）
CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'voice', 'image', 'video', 'link', 'audio')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT,
  original_text TEXT,
  ai_summary TEXT,
  ai_key_points TEXT[],
  ai_reuse_score INTEGER,
  ai_creation_suggestions TEXT[],
  source_url TEXT,
  source_platform TEXT,
  media_urls TEXT[],
  voice_url TEXT,
  thumbnail_url TEXT,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 内容标签关联表
CREATE TABLE IF NOT EXISTS content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, tag_id)
);

-- 监控关键词表
CREATE TABLE IF NOT EXISTS monitor_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  platforms TEXT[],
  frequency TEXT NOT NULL DEFAULT 'daily',
  importance_threshold INTEGER DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_check_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 热点内容表
CREATE TABLE IF NOT EXISTS hot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitor_keyword_id UUID REFERENCES monitor_keywords(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  original_url TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  original_content TEXT,
  ai_summary TEXT,
  key_points TEXT[],
  relevance_reason TEXT,
  creation_suggestions TEXT[],
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  credibility_score INTEGER,
  credibility_level TEXT CHECK (credibility_level IN ('red', 'yellow', 'green')),
  relevance_score INTEGER,
  importance_score INTEGER,
  importance_level TEXT CHECK (importance_level IN ('low', 'medium', 'high', 'urgent')),
  tags TEXT[],
  category TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'following', 'used', 'ignored')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hot_item_id UUID REFERENCES hot_items(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('hotspot', 'system')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 协作空间表
CREATE TABLE IF NOT EXISTS collaboration_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 协作成员表
CREATE TABLE IF NOT EXISTS space_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES collaboration_spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(space_id, user_id)
);

-- AI 任务表
CREATE TABLE IF NOT EXISTS ai_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  input JSONB,
  output JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 用量记录表
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  ai_summary_count INTEGER DEFAULT 0,
  link_parse_count INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  video_minutes NUMERIC DEFAULT 0,
  audio_minutes NUMERIC DEFAULT 0,
  ai_writing_count INTEGER DEFAULT 0,
  storage_used_mb NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- ===============================================================
-- 3. 创建索引优化查询性能
-- ===============================================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- 分类表索引
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_default ON categories(is_default);

-- 标签表索引
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

-- 内容表索引
CREATE INDEX IF NOT EXISTS idx_content_items_user_id ON content_items(user_id);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_items_category_id ON content_items(category_id);
CREATE INDEX IF NOT EXISTS idx_content_items_created_at ON content_items(created_at DESC);

-- 内容标签关联索引
CREATE INDEX IF NOT EXISTS idx_content_tags_content_id ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag_id ON content_tags(tag_id);

-- 监控关键词索引
CREATE INDEX IF NOT EXISTS idx_monitor_keywords_user_id ON monitor_keywords(user_id);
CREATE INDEX IF NOT EXISTS idx_monitor_keywords_is_active ON monitor_keywords(is_active);

-- 热点表索引
CREATE INDEX IF NOT EXISTS idx_hot_items_user_id ON hot_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hot_items_monitor_keyword_id ON hot_items(monitor_keyword_id);
CREATE INDEX IF NOT EXISTS idx_hot_items_status ON hot_items(status);
CREATE INDEX IF NOT EXISTS idx_hot_items_importance_level ON hot_items(importance_level);
CREATE INDEX IF NOT EXISTS idx_hot_items_created_at ON hot_items(created_at DESC);

-- 通知表索引
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 协作表索引
CREATE INDEX IF NOT EXISTS idx_space_members_space_id ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user_id ON space_members(user_id);

-- AI任务索引
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_id ON ai_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_content_id ON ai_tasks(content_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);

-- 用量记录索引
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_month ON usage_records(month);

-- ===============================================================
-- 4. 创建 Row Level Security (RLS) 策略
-- ===============================================================

-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- 用户表策略
CREATE POLICY "用户只能管理自己的信息" ON users
  FOR ALL USING (auth.uid() = id);

-- 分类表策略
CREATE POLICY "用户只能管理自己的分类" ON categories
  FOR ALL USING (auth.uid() = user_id);

-- 标签表策略
CREATE POLICY "用户只能管理自己的标签" ON tags
  FOR ALL USING (auth.uid() = user_id);

-- 内容表策略
CREATE POLICY "用户只能管理自己的内容" ON content_items
  FOR ALL USING (auth.uid() = user_id);

-- 内容标签关联策略
CREATE POLICY "用户只能管理自己内容的标签" ON content_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      WHERE ci.id = content_tags.content_id AND ci.user_id = auth.uid()
    )
  );

-- 监控关键词策略
CREATE POLICY "用户只能管理自己的监控关键词" ON monitor_keywords
  FOR ALL USING (auth.uid() = user_id);

-- 热点表策略
CREATE POLICY "用户只能管理自己的热点" ON hot_items
  FOR ALL USING (auth.uid() = user_id);

-- 通知表策略
CREATE POLICY "用户只能查看自己的通知" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- 协作空间策略
CREATE POLICY "用户只能查看所属协作空间" ON collaboration_spaces
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM space_members sm
      WHERE sm.space_id = collaboration_spaces.id AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "用户只能管理自己创建的协作空间" ON collaboration_spaces
  FOR ALL USING (auth.uid() = created_by);

-- 协作成员策略
CREATE POLICY "用户只能查看所属协作空间的成员" ON space_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM collaboration_spaces cs
      WHERE cs.id = space_members.space_id AND cs.created_by = auth.uid()
    )
  );

CREATE POLICY "用户只能管理自己创建的协作空间成员" ON space_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM collaboration_spaces cs
      WHERE cs.id = space_members.space_id AND cs.created_by = auth.uid()
    )
  );

-- AI任务策略
CREATE POLICY "用户只能管理自己的AI任务" ON ai_tasks
  FOR ALL USING (auth.uid() = user_id);

-- 用量记录策略
CREATE POLICY "用户只能查看自己的用量记录" ON usage_records
  FOR ALL USING (auth.uid() = user_id);

-- ===============================================================
-- 5. 创建触发器自动更新时间戳
-- ===============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有需要自动更新 updated_at 的表创建触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monitor_keywords_updated_at BEFORE UPDATE ON monitor_keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hot_items_updated_at BEFORE UPDATE ON hot_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collaboration_spaces_updated_at BEFORE UPDATE ON collaboration_spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_records_updated_at BEFORE UPDATE ON usage_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===============================================================
-- 6. 创建 Supabase Storage 桶（在控制台手动创建）
-- ===============================================================
-- 桶名称: media
-- 权限: 私有
-- 路径规则:
-- - 允许认证用户上传到 /{user_id}/**
-- - 允许认证用户读取自己的文件

-- ===============================================================
-- 7. 创建默认分类
-- ===============================================================
-- 注意：默认分类会在用户注册时自动创建，通过 Edge Function 或客户端代码实现
