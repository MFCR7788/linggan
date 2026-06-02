-- V2.0.2 效果追踪 + 多平台分发
-- publications: 用户在多平台发布的内容记录
-- publication_metrics: 自动抓取的指标(公众号/微博)
-- publication_manual_metrics: 人工录入的指标(抖音/小红书/视频号/B站)

-- 1) 发布记录表
CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('wechat_mp', 'weibo', 'douyin', 'xiaohongshu', 'wechat_video', 'bilibili', 'other')),
  account_id UUID,
  external_url TEXT,
  external_post_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  is_manual_post BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_publish_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publications_user_recent ON publications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_platform ON publications(user_id, platform, status);
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status, scheduled_publish_at)
  WHERE status IN ('scheduled', 'publishing');
CREATE INDEX IF NOT EXISTS idx_publications_content ON publications(content_id) WHERE content_id IS NOT NULL;

-- 2) 自动抓取的指标(2 平台)
CREATE TABLE IF NOT EXISTS publication_metrics (
  id BIGSERIAL PRIMARY KEY,
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  collects INT NOT NULL DEFAULT 0,
  followers_delta INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pub_metrics_recent ON publication_metrics(publication_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_metrics_capture ON publication_metrics(captured_at DESC);

-- 3) 人工录入的指标(4 平台)
CREATE TABLE IF NOT EXISTS publication_manual_metrics (
  id BIGSERIAL PRIMARY KEY,
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views INT,
  likes INT,
  comments INT,
  shares INT,
  collects INT,
  notes TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pub_manual_recent ON publication_manual_metrics(publication_id, captured_at DESC);

-- 4) RLS 策略
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_manual_metrics ENABLE ROW LEVEL SECURITY;

-- 用户只能看自己的发布
DROP POLICY IF EXISTS publications_user_select ON publications;
CREATE POLICY publications_user_select ON publications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS publications_user_insert ON publications;
CREATE POLICY publications_user_insert ON publications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS publications_user_update ON publications;
CREATE POLICY publications_user_update ON publications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS publications_user_delete ON publications;
CREATE POLICY publications_user_delete ON publications
  FOR DELETE USING (auth.uid() = user_id);

-- metrics 通过 publication 间接控制(用 JOIN 验证)
DROP POLICY IF EXISTS pub_metrics_select ON publication_metrics;
CREATE POLICY pub_metrics_select ON publication_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pub_metrics_insert ON publication_metrics;
CREATE POLICY pub_metrics_insert ON publication_metrics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pub_manual_select ON publication_manual_metrics;
CREATE POLICY pub_manual_select ON publication_manual_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pub_manual_insert ON publication_manual_metrics;
CREATE POLICY pub_manual_insert ON publication_manual_metrics
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_id AND p.user_id = auth.uid())
  );

-- 5) 触发器:自动更新 updated_at
CREATE OR REPLACE FUNCTION update_publications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_publications_updated_at ON publications;
CREATE TRIGGER trg_publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW
  EXECUTE FUNCTION update_publications_updated_at();

-- 6) 评论
COMMENT ON TABLE publications IS '用户在多平台发布的内容记录(2 平台自动 + 4 平台手动)';
COMMENT ON TABLE publication_metrics IS '自动抓取的数据(公众号/微博官方 API)';
COMMENT ON TABLE publication_manual_metrics IS '人工录入的数据(抖音/小红书/视频号/B站)';
