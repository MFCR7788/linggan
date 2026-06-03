-- ====== 微信支付订单表(V2.0.4 接入 WeChat Pay V3) ======
-- 加油包 + 订阅都用同一张表,通过 type 区分

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 商户单号 (我方生成,32 字符内,微信要求唯一)
  out_trade_no TEXT NOT NULL UNIQUE,
  -- 微信支付订单号 (微信生成,回调时填)
  transaction_id TEXT UNIQUE,

  -- 订单类型 + 关联资源
  type TEXT NOT NULL CHECK (type IN ('package', 'subscription')),
  package_id TEXT,                            -- credit_packages.id (type=package)
  subscription_tier TEXT,                     -- subscription_tiers.tier (type=subscription)

  -- 金额
  amount_cny NUMERIC(10, 2) NOT NULL,         -- 元
  amount_cents INTEGER NOT NULL,              -- 分(给微信用)

  -- 支付成功后要给的 credits 数(冗余字段,失败回滚不影响)
  credits_to_grant INTEGER NOT NULL,
  bonus_credits INTEGER NOT NULL DEFAULT 0,   -- 赠送 credits(展示用,grant 时一并加)

  -- 订单状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired')),
  payment_method TEXT NOT NULL DEFAULT 'wechat_h5',  -- wechat_h5 / wechat_jsapi / wechat_native

  -- 微信返回的 H5 跳转 URL(浏览器外打开微信)
  h5_url TEXT,

  -- 时间戳
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                     -- 订单超时时间(默认 30 分钟)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 微信回调原始 payload + 额外元数据
  callback_payload JSONB,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_out_trade_no ON payments(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_payments_status_expires ON payments(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();
