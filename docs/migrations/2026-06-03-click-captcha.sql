-- 点击文字验证码 (2026-06-03)
-- 替换原滑块验证: slider_captchas → click_captchas + 通用通行证 captcha_tokens
-- service_role 才能读写 (RLS 默认拒绝所有匿名)

-- 1. 挑战表: 存 6 个字的位置 + 期望点击顺序
CREATE TABLE IF NOT EXISTS click_captchas (
  token text PRIMARY KEY,
  positions jsonb NOT NULL,        -- [{char,x,y,rotate}, ...]
  expected_indices int[] NOT NULL, -- positions 数组下标 (要按顺序点的)
  width int NOT NULL DEFAULT 320,
  height int NOT NULL DEFAULT 180,
  hit_radius int NOT NULL DEFAULT 32,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_click_captchas_expires ON click_captchas(expires_at);

ALTER TABLE click_captchas ENABLE ROW LEVEL SECURITY;
-- RLS 启用但不建任何策略 → 仅 service_role 可访问

-- 2. 通用通行证: 任何 captcha 验证通过后写一条, send-code 据此放行
CREATE TABLE IF NOT EXISTS captcha_tokens (
  token text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'click',
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_captcha_tokens_expires ON captcha_tokens(expires_at);

ALTER TABLE captcha_tokens ENABLE ROW LEVEL SECURITY;

-- 3. 旧滑块表保留 (可选, 反正没人引用; 想删就执行下一行)
-- DROP TABLE IF EXISTS slider_captchas;
