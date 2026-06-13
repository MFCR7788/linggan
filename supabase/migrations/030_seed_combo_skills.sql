-- 灵集 V3.0 — account-presets 核心组合技能迁移
-- 将最常用的推荐组合转为 skills，Agent 前端从 SkillsHub 读取
-- 其余组合保留在 account-presets.ts（供 /ai 页面和 workflow 使用）
-- 日期: 2026-06-13

-- 小红书爆款笔记（电商）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'ecom_xhs',
  '📱 小红书爆款笔记',
  '当用户需要在小红书发布种草内容、产品推荐、好物分享时使用。自动串联文案→封面图→分发流程。',
  'social',
  ARRAY['小红书', '种草', '电商', '爆款'],
  '你是一位资深的小红书内容创作者。请根据用户提供的产品/主题，生成一篇高互动率的笔记：
1. 标题用 emoji+数字+痛点钩子，20字以内
2. 正文口语化，分段不超过3行，每段1-2个emoji
3. 结尾加互动引导
4. 推荐5-10个话题标签',
  ARRAY['小红书', '种草', '推荐', '好物', '爆款', '笔记'],
  '[
    {"tool": "generate_copywriting", "params": {"platform": "xiaohongshu", "style": "planting"}},
    {"tool": "generate_image", "params": {"aspectRatio": "3:4"}}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- 口播知识日更（知识IP）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'knowledge_oral',
  '🎙️ 口播知识日更',
  '当用户需要制作知识科普口播视频、专业知识讲解时使用。串联科普文案→数字人口播流程。',
  'video',
  ARRAY['知识', '科普', '口播', '数字人'],
  '你是一位专业的知识科普创作者。请将用户提供的专业主题转化为通俗易懂的口播脚本：
1. 开头3秒用反问或数据抓住注意力
2. 核心内容分3个要点，每点配合画面建议
3. 结尾给出实用总结
4. 总时长控制在60-90秒的口播量',
  ARRAY['知识', '科普', '口播', '教育', '课程'],
  '[
    {"tool": "generate_copywriting", "params": {"platform": "script", "style": "science"}},
    {"tool": "generate_digital_human"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- 产品种草一条龙（初创）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'startup_product',
  '🎁 产品种草一条龙',
  '当用户需要从产品图生成完整营销内容（文案+图片+视频）时使用。自动串联产品图→文案→生成流程。',
  'writing',
  ARRAY['产品', '种草', '营销', '推广'],
  '你是一位专业的品牌营销策划。请根据用户提供的产品信息，生成一套完整的内容方案：
1. 提炼3-5个核心卖点
2. 为每个卖点写一句吸引人的文案
3. 推荐最适合的发布平台和发布时间
4. 给出视觉效果建议',
  ARRAY['产品', '种草', '卖货', '推广', '营销', '品牌'],
  '[
    {"tool": "generate_copywriting", "params": {"style": "planting"}},
    {"tool": "generate_image", "params": {"aspectRatio": "1:1"}},
    {"tool": "compose_video"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- 情感共鸣短文（个人创作者）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'personal_resonant',
  '💭 情感共鸣短文',
  '当用户需要写走心、引发情感共鸣的短文时使用。适合个人创作者日常内容输出。',
  'writing',
  ARRAY['情感', '共鸣', '短文', '个人'],
  '你是一位擅长情感表达的短文作家。请根据用户提供的心情主题，创作一篇引发共鸣的短文：
1. 从一个具体的生活场景切入
2. 用细腻的观察展开情感层次
3. 结尾给读者一个温暖的收束或思考空间
4. 控制全文在200-400字',
  ARRAY['情感', '共鸣', '走心', '短文', '日记', '心情'],
  '[
    {"tool": "generate_copywriting", "params": {"style": "resonant"}},
    {"tool": "generate_image", "params": {"aspectRatio": "3:4"}}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- 探店9宫格（餐饮）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'restaurant_9grid',
  '📸 探店9宫格',
  '当用户需要为餐饮探店生成朋友圈九宫格内容时使用。自动串联菜品图→文案→九宫格流程。',
  'social',
  ARRAY['探店', '餐饮', '九宫格', '朋友圈'],
  '你是一位社交媒体美食博主。请根据用户提供的菜品信息，创作一套吸引人的发布内容：
1. 为每道菜写一句亮点描述（15字以内）
2. 设计一个吸引人的总标题
3. 推荐最适合的发布时间和话题标签
4. 给出配图排版建议',
  ARRAY['探店', '餐饮', '美食', '九宫格', '朋友圈', '菜品'],
  '[
    {"tool": "generate_copywriting", "params": {"style": "planting", "industry": "food"}},
    {"tool": "generate_grid_images"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- 旅行攻略Vlog（旅游）
INSERT INTO skills (name, display_name, description, category, tags, prompt_template, trigger_keywords, steps, version, visibility)
VALUES (
  'travel_guide',
  '🗺️ 旅行攻略 Vlog',
  '当用户需要制作旅行攻略类视频内容时使用。自动串联攻略文案→景点图→视频合成流程。',
  'video',
  ARRAY['旅行', '攻略', 'Vlog', '景点'],
  '你是一位旅行攻略创作者。请根据用户提供的目的地信息，生成一份旅行攻略视频脚本：
1. 目的地亮点速览（3个必去理由）
2. 行程安排建议（DAY1/DAY2格式）
3. 实用小贴士（交通/住宿/美食）
4. 配画面建议和BGM推荐
5. 结尾互动引导',
  ARRAY['旅行', '旅游', '攻略', 'Vlog', '景点', '打卡'],
  '[
    {"tool": "generate_copywriting", "params": {"style": "story", "industry": "travel"}},
    {"tool": "generate_image", "params": {"aspectRatio": "16:9"}},
    {"tool": "compose_video"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;
