-- 滑块验证码存储
-- 用于: GET /api/captcha/slider 生成, POST /api/captcha/slider/verify 验证
-- 流程: 用户拖动滑块对齐缺口 → 后端校验坐标 → 标记 used=true → /api/sms/send-code 校验 captcha_token
CREATE TABLE IF NOT EXISTS slider_captchas (
  token text PRIMARY KEY,
  puzzle_x int NOT NULL,
  puzzle_y int NOT NULL,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 定期清理过期记录 (5 分钟 TTL)
CREATE INDEX IF NOT EXISTS idx_slider_captchas_expires ON slider_captchas(expires_at);

-- RLS: anon / authenticated 不允许直接读写, 仅 service_role 走服务端
ALTER TABLE slider_captchas ENABLE ROW LEVEL SECURITY;

-- 不创建任何 policy = 完全禁止 anon/authenticated 访问
-- 服务端 createAdminClient() 用 service_role key 绕过 RLS

-- 2026-06-03: 滑块已替换为点击文字验证码, slider_captchas 表清理
DROP TABLE IF EXISTS slider_captchas;
