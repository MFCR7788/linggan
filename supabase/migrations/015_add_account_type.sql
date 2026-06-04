-- 给 users 表添加 account_type 列
-- 用于账号类型选择功能(startup/knowledge/ecommerce/b2b/personal/training/restaurant/medical)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_type TEXT;

COMMENT ON COLUMN users.account_type IS '账号类型: startup/knowledge/ecommerce/b2b/personal/training/restaurant/medical';
