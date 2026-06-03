-- 灵集 Credit 计费系统 (V2.0.3 订阅制铺路)
-- 4 张表: user_credits(余额) / credit_transactions(流水) / credit_packages(加油包) / subscriptions(订阅)

-- ====== 1. user_credits 用户余额表 ======
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- 当前可用余额
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'studio', 'enterprise')),
  tier_started_at TIMESTAMPTZ,
  tier_expires_at TIMESTAMPTZ,                              -- 月底清零的截止时间
  last_reset_at TIMESTAMPTZ,                                -- 上次清零时间(防止重复)
  lifetime_consumed INTEGER NOT NULL DEFAULT 0,            -- 累计消耗(用于 B2B 报表)
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,            -- 累计购买(加油包+订阅)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_tier ON user_credits(tier);
CREATE INDEX IF NOT EXISTS idx_user_credits_expires ON user_credits(tier_expires_at) WHERE tier_expires_at IS NOT NULL;

-- ====== 2. credit_transactions 流水表 ======
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,                                  -- 正=加,负=减
  type TEXT NOT NULL CHECK (type IN (
    'subscription_grant',    -- 订阅赠送(月初)
    'package_purchase',      -- 加油包购买
    'consume',               -- AI 调用消耗
    'refund',                -- 退款
    'admin_adjust',          -- 管理员调整
    'reset',                 -- 月底清零(扣除剩余订阅赠送)
    'bonus_first_purchase'   -- 首次购买赠送
  )),
  balance_after INTEGER NOT NULL,                           -- 交易后余额(审计用)
  source TEXT,                                              -- 触发源: 'ai_video' / 'ai_image' / 'tts' / 'admin'
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,                       -- 额外信息(模型名、任务 ID、加油包 ID 等)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_time ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_tx_source ON credit_transactions(source);

-- ====== 3. credit_packages 加油包目录 ======
CREATE TABLE IF NOT EXISTS credit_packages (
  id TEXT PRIMARY KEY,                                      -- slug: 'starter' / 'standard' / 'large' / 'enterprise'
  name TEXT NOT NULL,                                       -- 展示名: '体验包' / '标准包'
  credits INTEGER NOT NULL,                                 -- 主 credits
  bonus_credits INTEGER NOT NULL DEFAULT 0,                 -- 赠送 credits
  price_cny NUMERIC(10, 2) NOT NULL,                        -- 价格(元)
  original_price_cny NUMERIC(10, 2),                        -- 原价(划线价)
  validity_days INTEGER NOT NULL DEFAULT 365,              -- 有效期(天)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  badge TEXT,                                               -- 角标: '热销' / '省 30%' 等
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 预置 4 个加油包
INSERT INTO credit_packages (id, name, credits, bonus_credits, price_cny, original_price_cny, validity_days, is_active, sort_order, badge) VALUES
  ('starter',  '体验包',   100,  20,   29.0,   35.0,   180, TRUE, 1, '入门首选'),
  ('standard', '标准包',   500,  150,  119.0,  149.0,  365, TRUE, 2, '省 20%'),
  ('large',    '大包',     2000, 800,  399.0,  499.0,  365, TRUE, 3, '省 30%'),
  ('enterprise', '企业包', 10000, 5000, 1599.0, 1999.0,  365, TRUE, 4, '省 45%')
ON CONFLICT (id) DO UPDATE SET
  credits = EXCLUDED.credits,
  bonus_credits = EXCLUDED.bonus_credits,
  price_cny = EXCLUDED.price_cny,
  original_price_cny = EXCLUDED.original_price_cny,
  badge = EXCLUDED.badge,
  updated_at = NOW();

-- ====== 4. subscriptions 订阅记录 ======
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'pro', 'studio', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  monthly_credits INTEGER NOT NULL,                        -- 月度赠送 credits
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  payment_method TEXT,                                      -- 'wechat' / 'alipay' / 'stripe' / 'admin'
  external_subscription_id TEXT,                            -- 第三方订阅 ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_user_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_expires ON subscriptions(expires_at) WHERE status = 'active';

-- ====== 5. 订阅档位配置(写死,方便前端展示) ======
CREATE TABLE IF NOT EXISTS subscription_tiers (
  tier TEXT PRIMARY KEY CHECK (tier IN ('free', 'basic', 'pro', 'studio', 'enterprise')),
  name TEXT NOT NULL,
  monthly_price_cny NUMERIC(10, 2) NOT NULL,
  monthly_credits INTEGER NOT NULL,                        -- 月度赠送 credits
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,                      -- 特性列表(展示用)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO subscription_tiers (tier, name, monthly_price_cny, monthly_credits, description, features, is_active, sort_order) VALUES
  ('free',       '免费版',   0,     30,   '试用体验',
    '["30 credits/月(约 1-2 次视频)", "基础文案/图片", "fast 档视频", "社区支持"]'::jsonb,
    TRUE, 0),
  ('basic',      '个人版',   29,    150,  '轻度创作者',
    '["150 credits/月", "全部 AI 功能", "fast + standard 视频", "邮箱支持"]'::jsonb,
    TRUE, 1),
  ('pro',        '创作者版', 99,    500,  '中度运营',
    '["500 credits/月", "全部 AI 功能", "所有视频档位", "1 次声音复刻/月", "数字分身 5 次/月", "优先客服"]'::jsonb,
    TRUE, 2),
  ('studio',     '工作室版', 299,   1800, '重度运营/MCN',
    '["1800 credits/月", "全部 AI 功能", "所有视频档位", "3 次声音复刻/月", "数字分身 20 次/月", "Animate 不限", "专属客服"]'::jsonb,
    TRUE, 3),
  ('enterprise', '企业版',   999,   6000, '4A/品牌/培训机构',
    '["6000 credits/月", "全部 AI 功能", "所有视频档位", "10 次声音复刻/月", "数字分身不限", "定制模型微调", "B2B 合同 SLA"]'::jsonb,
    TRUE, 4)
ON CONFLICT (tier) DO UPDATE SET
  monthly_price_cny = EXCLUDED.monthly_price_cny,
  monthly_credits = EXCLUDED.monthly_credits,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  updated_at = NOW();

-- ====== 6. 自动初始化新用户 credits 记录 ======
CREATE OR REPLACE FUNCTION init_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance, tier)
  VALUES (NEW.id, 30, 'free')  -- 新用户默认 30 credits
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_init_user_credits ON users;
CREATE TRIGGER trg_init_user_credits
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION init_user_credits();

-- ====== 7. updated_at 自动维护 ======
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_credits_updated ON user_credits;
CREATE TRIGGER trg_user_credits_updated BEFORE UPDATE ON user_credits
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ====== 8. 原子扣点 RPC(关键,避免并发扣点漏洞) ======
CREATE OR REPLACE FUNCTION consume_credits_atomic(
  p_user_id UUID,
  p_amount INT
)
RETURNS TABLE(balance_after INT) AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE user_credits
  SET balance = balance - p_amount,
      lifetime_consumed = lifetime_consumed + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    -- 区分:用户不存在 vs 余额不足
    IF NOT EXISTS (SELECT 1 FROM user_credits WHERE user_id = p_user_id) THEN
      RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  RETURN QUERY SELECT v_new_balance;
END;
$$ LANGUAGE plpgsql;
