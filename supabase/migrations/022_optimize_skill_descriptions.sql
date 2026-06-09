-- 灵集 AI V2.0 — 优化技能 description 触发词
-- 参考 Anthropic skill-creator：description 是主要触发机制，必须包含"做什么 + 何时用"
-- 使用 UPDATE：无论之前的迁移如何应用都安全

UPDATE skills SET description = '当用户需要写小红书文案、优化标题正文、提到小红书发布/涨粉/爆款笔记时使用。提供高互动率标题、正文结构和话题标签策略。'
WHERE name = 'xiaohongshu-optimizer';

UPDATE skills SET description = '当用户想做抖音短视频、需要口播脚本、或提到抖音创作/起号/流量/完播率时使用。提供3秒钩子设计、口播逐字稿和节奏控制。'
WHERE name = 'douyin-script';

UPDATE skills SET description = '当用户需要公众号文章排版优化、提到微信推文/排版/阅读体验/封面图/配图时使用。提供排版规范、配图策略和互动设计。'
WHERE name = 'wechat-formatter';

UPDATE skills SET description = '当用户需要SEO标题、百度/微信搜一搜优化、搜索排名、标题撰写时使用。覆盖标题模板、关键词策略和SERP显示规则。'
WHERE name = 'seo-title-gen';

UPDATE skills SET description = '当用户需要将同一内容分发到多个平台、一稿多投、跨平台适配时使用。支持小红书/抖音/公众号/微博/知乎等多平台风格的自动改写。'
WHERE name = 'cross-platform';

UPDATE skills SET description = '当用户提到热点事件分析、新闻追踪、创作选题、蹭热点、话题预判时使用。提供事件脉络梳理、创作角度挖掘和传播风险评估。'
WHERE name = 'hotspot-analyzer';

UPDATE skills SET description = '当用户需要AI绘画提示词、Midjourney/Stable Diffusion/DALL-E prompt、生图描述优化时使用。提供5层prompt结构、参数指导和风格变体建议。'
WHERE name = 'ai-image-prompt';

UPDATE skills SET description = '当用户需要拍摄视频、设计分镜脚本、提到镜头规划/运镜/视频分镜/拍摄脚本时使用。提供分镜表、镜头词汇、拍摄法则和后期建议。'
WHERE name = 'video-storyboard';
