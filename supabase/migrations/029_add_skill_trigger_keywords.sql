-- 灵集 V3.0 — Skill 增强字段
-- trigger_keywords: 触发关键词数组，用于自动匹配用户意图
-- steps: 工具链步骤定义 [{tool, params}]
-- 日期: 2026-06-13

ALTER TABLE skills ADD COLUMN IF NOT EXISTS trigger_keywords text[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS steps jsonb;

-- 为已有技能回填 trigger_keywords
UPDATE skills SET trigger_keywords = ARRAY['小红书', '种草', '推荐', '好物', 'RED', '笔记'] WHERE name = 'xiaohongshu-optimizer' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['抖音', '短视频', '脚本', '口播', '带货'] WHERE name = 'douyin-script' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['公众号', '文章', '推文', '长文', '订阅号'] WHERE name = 'wechat-formatter' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['SEO', '标题', '优化', '搜索'] WHERE name = 'seo-title-gen' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['多平台', '一稿多发', '跨平台', '改写', 'remix', '适配'] WHERE name = 'cross-platform' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['热点', '选题', '追踪', '蹭热度', '趋势'] WHERE name = 'hotspot-analyzer' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['图片', '绘画', '生图', 'AI绘画'] WHERE name = 'ai-image-prompt' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['视频', '分镜', '故事板', '脚本'] WHERE name = 'video-storyboard' AND cardinality(trigger_keywords) = 0;
UPDATE skills SET trigger_keywords = ARRAY['女装', '服装', '带货', '穿搭', '卖货'] WHERE name = 'ai-clothing-sales-video' AND cardinality(trigger_keywords) = 0;
