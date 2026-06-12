-- 灵集 AI — skills 表增加 bound_tools + required_tools 字段
-- 用于技能匹配后自动激活绑定的 Agent 工具

ALTER TABLE skills ADD COLUMN IF NOT EXISTS bound_tools text[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS required_tools text[] DEFAULT '{}';

-- 更新已有技能：AI女装带货视频 绑定相关 Agent 工具
UPDATE skills SET
  bound_tools = ARRAY['generate_image', 'generate_copywriting', 'compose_video', 'synthesize_speech'],
  required_tools = ARRAY['generate_image', 'compose_video']
WHERE name = 'ai-clothing-sales-video' AND cardinality(bound_tools) = 0;
