-- 平台集成配置中心 (V2.0.2 后续)
-- 把 6 个 V2.0.2 env 集中管理(状态、申请指引、解锁说明)
-- 注: 这是"配置中心",不是 env 的真源 — Vercel 的 process.env 仍是真源,这里给用户展示/复制/加密备份

-- 1. 新表
CREATE TABLE IF NOT EXISTS platform_integration_settings (
  key_name TEXT PRIMARY KEY,
  value_encrypted TEXT,                 -- AES-256-GCM 加密(复用 src/lib/platforms/encryption.ts)
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  configured_by UUID REFERENCES users(id) ON DELETE SET NULL,
  configured_at TIMESTAMPTZ,
  description TEXT NOT NULL,            -- "在哪申请 + 解锁什么"中文
  apply_url TEXT,                       -- 申请链接(可空,如自动生成类)
  category TEXT NOT NULL CHECK (category IN ('crypto', 'cron', 'oauth')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 预置 6 行(只填元信息,value_encrypted 为 NULL 表示未配置)
INSERT INTO platform_integration_settings (key_name, category, description, apply_url) VALUES
  ('PLATFORM_ENCRYPTION_KEY', 'crypto',
   '平台 token 加密密钥(AES-256-GCM,32 字节 hex)。缺失时多平台 OAuth 自动发布与定时发布全部 500。在本页点"自动生成"后,把生成的字符串复制到 Vercel → Settings → Environment Variables。',
   NULL),
  ('CRON_SECRET', 'cron',
   'Vercel cron 调用 worker 的鉴权密钥(32 字节 hex)。缺失时 cron 端点返回 401,任务队列与定时发布全停。同样在 Vercel 配置。',
   NULL),
  ('WECHAT_MP_APP_ID', 'oauth',
   '微信公众号 AppID。需已认证的服务号 + 微信开放平台开发者账号。在"微信公众平台 → 开发 → 基本配置"获取。配置后,/publish 可一键 OAuth 授权公众号并自动发布文章。',
   'https://mp.weixin.qq.com/'),
  ('WECHAT_MP_APP_SECRET', 'oauth',
   '微信公众号 AppSecret,与 AppID 配对。同一处获取。',
   'https://mp.weixin.qq.com/'),
  ('WEIBO_APP_KEY', 'oauth',
   '微博开放平台 App Key。需在"微博开放平台"创建网站应用并通过审核。配置后,/publish 可一键 OAuth 授权微博并自动发微博。',
   'https://open.weibo.com/'),
  ('WEIBO_APP_SECRET', 'oauth',
   '微博开放平台 App Secret,与 App Key 配对。',
   'https://open.weibo.com/')
ON CONFLICT (key_name) DO NOTHING;

-- 3. updated_at 触发器
CREATE OR REPLACE FUNCTION update_platform_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_platform_integration_settings ON platform_integration_settings;
CREATE TRIGGER trigger_update_platform_integration_settings
  BEFORE UPDATE ON platform_integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_platform_integration_settings_updated_at();

-- 4. 注释
COMMENT ON TABLE platform_integration_settings IS '平台级集成配置中心(非 per-user)';
COMMENT ON COLUMN platform_integration_settings.value_encrypted IS 'AES-256-GCM 加密密文(b64 iv||authTag||ct);PLATFORM_ENCRYPTION_KEY 未配置时无法解密';
COMMENT ON COLUMN platform_integration_settings.category IS 'crypto=AES key / cron=worker auth / oauth=平台凭证';

-- 5. 索引(按 category 分类查)
CREATE INDEX IF NOT EXISTS idx_platform_integration_settings_category
  ON platform_integration_settings(category);
