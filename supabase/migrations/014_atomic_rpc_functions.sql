-- 灵集 V2.0.3 原子 RPC 函数
-- 消除 credits/usage 读-改-写竞态，替代客户端 CAS 降级路径
--
-- 部署说明：
--   在 Supabase SQL Editor 中执行本文件，或通过 supabase db push 部署。
--   所有函数均设计为幂等（CREATE OR REPLACE），可重复执行。

-- ====== 1. grant_credits_atomic (加点/退款) ======
-- 用于 grant() 和 refund()，一条 SQL 完成读-改-写，避免 TOCTOU 竞态
CREATE OR REPLACE FUNCTION grant_credits_atomic(
  p_user_id UUID,
  p_amount INT,
  p_is_purchase BOOLEAN DEFAULT true
)
RETURNS TABLE(balance_after INT) AS $$
DECLARE
  v_new_balance INT;
BEGIN
  -- 确保用户记录存在（lazy init）
  INSERT INTO user_credits (user_id, balance, tier)
  VALUES (p_user_id, 0, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  IF p_is_purchase THEN
    -- 购买/订阅赠送：同时累加 lifetime_purchased
    UPDATE user_credits
    SET balance = balance + p_amount,
        lifetime_purchased = lifetime_purchased + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSE
    -- 退款：不更新 lifetime_purchased（退款不是充值）
    UPDATE user_credits
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  END IF;

  RETURN QUERY SELECT v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ====== 2. add_storage_usage_atomic (存储用量累加/扣减) ======
-- 用于 addStorageUsage() 和 subtractStorageUsage()
CREATE OR REPLACE FUNCTION add_storage_usage_atomic(
  p_user_id UUID,
  p_month TEXT,
  p_mb NUMERIC
)
RETURNS void AS $$
BEGIN
  -- 确保记录存在
  INSERT INTO usage_records (user_id, month, storage_used_mb)
  VALUES (p_user_id, p_month, 0)
  ON CONFLICT (user_id, month) DO NOTHING;

  UPDATE usage_records
  SET storage_used_mb = GREATEST(0, storage_used_mb + p_mb),
      updated_at = NOW()
  WHERE user_id = p_user_id AND month = p_month;
END;
$$ LANGUAGE plpgsql;

-- ====== 3. increment_usage_field (AI 用量计数器累加) ======
-- 用于 logAiUsage()，支持按字段名动态累加，避免读-改-写竞态
CREATE OR REPLACE FUNCTION increment_usage_field(
  p_user_id UUID,
  p_month TEXT,
  p_field TEXT,
  p_delta INT DEFAULT 1
)
RETURNS void AS $$
BEGIN
  -- 确保记录存在
  INSERT INTO usage_records (user_id, month, storage_used_mb)
  VALUES (p_user_id, p_month, 0)
  ON CONFLICT (user_id, month) DO NOTHING;

  -- 动态字段更新（白名单防护，杜绝 SQL 注入）
  IF p_field IN ('ai_summary_count', 'ai_writing_count', 'image_count', 'video_count', 'digital_human_count') THEN
    EXECUTE format(
      'UPDATE usage_records SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE user_id = $2 AND month = $3',
      p_field, p_field
    ) USING p_delta, p_user_id, p_month;
  ELSE
    RAISE EXCEPTION 'Invalid usage field: %', p_field;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ====== 4. 补充缺失的 digital_human_count 列 ======
-- usage_records 表缺少此列，而 logAiUsage 已在使用
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_records' AND column_name = 'digital_human_count'
  ) THEN
    ALTER TABLE usage_records ADD COLUMN digital_human_count INTEGER DEFAULT 0;
  END IF;
END $$;
