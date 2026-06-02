-- V2.0.2 多平台分发 - 平台账号表
-- platform_accounts: 用户的 OAuth 授权账号(access_token 加密存)

CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('wechat_mp', 'weibo')),
  account_name TEXT NOT NULL,
  account_avatar TEXT,
  open_id TEXT,                              -- 平台的 openid / uid
  access_token_encrypted TEXT NOT NULL,      -- AES-256-GCM 加密
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一用户同一平台同一 open_id 只能有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_accounts_unique
  ON platform_accounts(user_id, platform, open_id)
  WHERE open_id IS NOT NULL;

-- 列出用户的账号(按平台过滤)
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user
  ON platform_accounts(user_id, platform, status);

-- 关联 publications.account_id(幂等)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_publications_account' AND table_name = 'publications'
  ) THEN
    ALTER TABLE publications
      ADD CONSTRAINT fk_publications_account
      FOREIGN KEY (account_id) REFERENCES platform_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_accounts_user_select ON platform_accounts;
CREATE POLICY platform_accounts_user_select ON platform_accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS platform_accounts_user_insert ON platform_accounts;
CREATE POLICY platform_accounts_user_insert ON platform_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS platform_accounts_user_update ON platform_accounts;
CREATE POLICY platform_accounts_user_update ON platform_accounts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS platform_accounts_user_delete ON platform_accounts;
CREATE POLICY platform_accounts_user_delete ON platform_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- 触发器
CREATE OR REPLACE FUNCTION update_platform_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_accounts_updated_at ON platform_accounts;
CREATE TRIGGER trg_platform_accounts_updated_at
  BEFORE UPDATE ON platform_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_accounts_updated_at();

COMMENT ON TABLE platform_accounts IS '用户的多平台 OAuth 授权账号(token 用 PLATFORM_ENCRYPTION_KEY 加密)';
