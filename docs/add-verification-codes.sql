-- 添加验证码表
-- 运行这个脚本之前，确保已经运行过完整的 supabase-schema.sql

-- 1. 创建验证码表
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

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone);
CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at ON verification_codes(created_at DESC);

-- 3. 启用 RLS
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- 4. 创建 RLS 策略 - 允许所有人插入验证码（因为发送验证码时用户还未登录）
CREATE POLICY "允许插入验证码" ON verification_codes
  FOR INSERT WITH CHECK (true);

-- 5. 创建 RLS 策略 - 允许所有人读取验证码（因为登录时用户还未登录）
CREATE POLICY "允许读取验证码" ON verification_codes
  FOR SELECT USING (true);

-- 6. 创建 RLS 策略 - 允许所有人更新验证码（标记为已使用时）
CREATE POLICY "允许更新验证码" ON verification_codes
  FOR UPDATE USING (true);

-- 7. 创建 RLS 策略 - 允许所有人删除过期验证码
CREATE POLICY "允许删除验证码" ON verification_codes
  FOR DELETE USING (true);
