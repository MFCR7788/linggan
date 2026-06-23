-- 更新 subscription_tiers features：添加热点监控词数量限制，去掉不存在的「邮箱支持」
-- 日期: 2026-06-24

UPDATE subscription_tiers SET features = '[
  "30 credits/月(约 1-2 次视频)",
  "基础文案/图片",
  "fast 档视频",
  "社区支持",
  "热点监控 1 个词"
]'::jsonb WHERE tier = 'free';

UPDATE subscription_tiers SET features = '[
  "150 credits/月",
  "全部 AI 功能",
  "fast + standard 视频",
  "热点监控 2 个词"
]'::jsonb WHERE tier = 'basic';

UPDATE subscription_tiers SET features = '[
  "500 credits/月",
  "全部 AI 功能",
  "所有视频档位",
  "1 次声音复刻/月",
  "数字分身 5 次/月",
  "热点监控 5 个词",
  "优先客服"
]'::jsonb WHERE tier = 'pro';

UPDATE subscription_tiers SET features = '[
  "1800 credits/月",
  "全部 AI 功能",
  "所有视频档位",
  "3 次声音复刻/月",
  "数字分身 20 次/月",
  "Animate 不限",
  "热点监控 10 个词",
  "专属客服"
]'::jsonb WHERE tier = 'studio';

UPDATE subscription_tiers SET features = '[
  "6000 credits/月",
  "全部 AI 功能",
  "所有视频档位",
  "10 次声音复刻/月",
  "数字分身不限",
  "热点监控 20 个词",
  "定制模型微调",
  "B2B 合同 SLA"
]'::jsonb WHERE tier = 'enterprise';
