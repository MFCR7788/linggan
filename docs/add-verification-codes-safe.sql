-- 安全版本的验证码表创建脚本
-- 这个脚本可以重复运行而不会报错

-- 1. 创建验证码表（如果不存在）
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'login',
  used BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone)
);

-- 2. 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone);
CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at ON verification_codes(created_at DESC);

-- 3. 启用 RLS
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- 4. 安全地创建策略（检查是否存在）
DO $$
BEGIN
  -- 检查策略是否存在，不存在才创建
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'verification_codes' 
    AND policyname = '允许插入验证码'
  ) THEN
    CREATE POLICY "允许插入验证码" ON verification_codes
      FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'verification_codes' 
    AND policyname = '允许读取验证码'
  ) THEN
    CREATE POLICY "允许读取验证码" ON verification_codes
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'verification_codes' 
    AND policyname = '允许更新验证码'
  ) THEN
    CREATE POLICY "允许更新验证码" ON verification_codes
      FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'verification_codes' 
    AND policyname = '允许删除验证码'
  ) THEN
    CREATE POLICY "允许删除验证码" ON verification_codes
      FOR DELETE USING (true);
  END IF;

END $$;

-- 验证是否创建成功
SELECT 'Verification codes table setup complete!' AS status;
