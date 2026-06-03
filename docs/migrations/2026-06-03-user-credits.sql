-- 用户 Credits 计费系统 (2026-06-03)
-- 4 张表 + 1 个原子扣点 RPC
-- service_role 才能读写 (RLS 默认拒绝匿名)
--
-- 关联:
--   user_credits.user_id → users.id (auth.users)
--   credit_transactions.user_id → users.id
--   subscriptions.user_id → users.id
--   credit_packages / subscription_tiers 是商品目录, 所有用户共享

-- ===============================================================
-- 1. user_credits: 用户余额账户 (一行/用户)
-- ===============================================================
CREATE TABLE IF NOT EXISTS user_credits (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','basic','pro','studio','enterprise')),
  tier_expires_at timestamptz,
  lifetime_consumed integer NOT NULL DEFAULT 0,
  lifetime_purchased integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_credits_tier ON user_credits(tier);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- ===============================================================
-- 2. credit_transactions: 流水 (所有 balance 变动)
-- ===============================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL,                     -- 正=入账, 负=扣减
  type text NOT NULL CHECK (type IN ('subscription_grant','package_purchase','consume','refund','admin_adjust','reset','bonus_first_purchase')),
  balance_after integer NOT NULL,
  source text,                                 -- e.g. 'ai_video', 'ai_chat', 'package_purchase'
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_refund ON credit_transactions(user_id, (metadata->>'taskId')) WHERE type = 'refund';

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- ===============================================================
-- 3. credit_packages: 加油包目录
-- ===============================================================
CREATE TABLE IF NOT EXISTS credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL,
  bonus_credits integer NOT NULL DEFAULT 0,
  price_cny numeric(10,2) NOT NULL,
  original_price_cny numeric(10,2),
  validity_days integer NOT NULL DEFAULT 365,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  badge text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_packages_active ON credit_packages(is_active, sort_order);

ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

-- 种子数据 (3 个标准加油包)
INSERT INTO credit_packages (name, credits, bonus_credits, price_cny, original_price_cny, validity_days, sort_order, badge)
VALUES
  ('体验包', 100, 0, 9.90, NULL, 90, 1, NULL),
  ('标准包', 500, 50, 49.00, 59.00, 180, 2, '人气'),
  ('旗舰包', 1200, 200, 99.00, 129.00, 365, 3, '推荐')
ON CONFLICT DO NOTHING;

-- ===============================================================
-- 4. subscription_tiers: 订阅档位
-- ===============================================================
CREATE TABLE IF NOT EXISTS subscription_tiers (
  tier text PRIMARY KEY CHECK (tier IN ('free','basic','pro','studio','enterprise')),
  name text NOT NULL,
  monthly_price_cny numeric(10,2),
  monthly_credits integer,
  description text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- 种子数据
INSERT INTO subscription_tiers (tier, name, monthly_price_cny, monthly_credits, description, features, sort_order)
VALUES
  ('free', '免费版', 0, 50, '每月赠送 50 credits,体验所有核心功能',
    '["每月 50 credits","基础 AI 对话","图片/视频生成 (有水印)"]'::jsonb, 0),
  ('basic', '基础版', 29, 500, '适合个人创作者',
    '["每月 500 credits","无水印生成","优先级队列"]'::jsonb, 1),
  ('pro', '专业版', 99, 2000, '适合高产创作者和团队',
    '["每月 2000 credits","高级模型 (GPT-4 级)","API 接入","优先客服"]'::jsonb, 2),
  ('studio', '工作室版', 299, 8000, '适合小型工作室',
    '["每月 8000 credits","专属模型微调","多人协作","专属客户经理"]'::jsonb, 3),
  ('enterprise', '企业版', NULL, NULL, '按需定制,联系商务',
    '["不限 credits","私有化部署","SLA 99.9%","7x24 客服"]'::jsonb, 4)
ON CONFLICT (tier) DO NOTHING;

-- ===============================================================
-- 5. subscriptions: 用户订阅记录
-- ===============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier text NOT NULL REFERENCES subscription_tiers(tier),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','pending')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  wechat_order_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status, expires_at);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ===============================================================
-- 6. 原子扣点 RPC: 替代客户端两步, 防 TOCTOU
-- ===============================================================
CREATE OR REPLACE FUNCTION consume_credits_atomic(
  p_user_id uuid,
  p_amount integer
) RETURNS TABLE(balance_after integer) AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE user_credits
  SET balance = balance - p_amount,
      lifetime_consumed = lifetime_consumed + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===============================================================
-- 7. 自动创建 user_credits 行 (新用户注册时)
-- ===============================================================
CREATE OR REPLACE FUNCTION ensure_user_credits_row() RETURNS trigger AS $$
BEGIN
  INSERT INTO user_credits (user_id, balance, tier)
  VALUES (NEW.id, 50, 'free')  -- 新用户赠送 50 credits
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_user_credits ON users;
CREATE TRIGGER trg_ensure_user_credits
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_user_credits_row();
