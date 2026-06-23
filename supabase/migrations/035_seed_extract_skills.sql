-- 灵集 — 视频文案提取技能入库 + 默认安装
-- 将 extract_content / douyin_transcript 加入 skills 表，所有用户默认安装
-- 日期: 2026-06-23

-- ── 1. 插入多平台内容提取技能 ──

INSERT INTO skills (name, display_name, description, category, tags, prompt_template, parameter_schema, trigger_keywords, steps, version, visibility)
VALUES (
  'extract_content',
  '📋 多平台内容提取',
  '从抖音、B站、小红书、快手、今日头条、腾讯新闻、微博、知乎等平台的链接中提取文字内容或视频语音文案。自动识别平台，视频类下载后AI语音识别转文字，文字类智能提取正文。支持单个链接或批量提取。',
  '内容采集',
  ARRAY['抖音', '小红书', 'B站', '今日头条', '腾讯新闻', '快手', '微博', '知乎', '视频', '文案', '提取', '转写', '语音识别', '字幕', 'douyin', 'xiaohongshu', 'bilibili', '灵感', '采集'],
  '你正在执行「多平台内容提取」任务。

**功能说明**: 从抖音/B站/小红书/快手/今日头条/腾讯新闻/微博/知乎等平台提取链接中的文字内容或视频文案（含语音转文字）。

**支持的平台**:
- 🎙️ 视频平台（下载视频→语音识别→文字）: 抖音、B站、快手、微博视频、今日头条视频（西瓜视频）
- 📄 文字平台（智能提取正文）: 小红书笔记、今日头条文章、腾讯新闻、知乎、微信公众号
- 🌐 通用网页: jina.ai Reader 自动提取正文

**执行规则**:
1. 从用户消息中提取所有链接（可混合不同平台）
2. 调用 extract_content 工具提取内容
3. 如果用户只想要摘要，设置 fast_only=true 快速获取标题和描述
4. 将提取的内容清晰呈现，标注平台、来源和提取方式

**质量标准**:
- 完整性：必须输出标题+正文/文案，保留原文段落结构
- 准确性：ASR语音识别结果需标注置信度，明显错字需标注[?]
- 来源标注：每条提取结果必须标注平台名称+原始链接
- 清理临时文件：提取完成后自动删除下载的视频和音频文件

**自检清单**（返回前逐项确认）:
- [ ] 已标注平台和来源链接
- [ ] 已说明提取方式（🎙️语音识别/📄网页提取/📝摘要/🎬B站API）
- [ ] 内容有结构（标题/正文分段），不是一大段文字
- [ ] 失败时已尝试降级并说明',
  '{
    "type": "object",
    "properties": {
      "urls": {"type": "string", "description": "要提取的链接，多个用换行或逗号分隔"},
      "fast_only": {"type": "boolean", "description": "是否仅快速提取（不下载视频，只获取页面描述）"}
    },
    "required": ["urls"]
  }'::jsonb,
  ARRAY['提取', '文案', '视频', '链接', '抖音', '下载', '语音识别', '转文字', '字幕', '笔记', '文章'],
  '[
    {"tool": "extract_content"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  prompt_template = EXCLUDED.prompt_template,
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- ── 2. 插入视频文案提取技能（抖音/B站/快手专用） ──

INSERT INTO skills (name, display_name, description, category, tags, prompt_template, parameter_schema, trigger_keywords, steps, version, visibility)
VALUES (
  'douyin_transcript',
  '📹 视频文案提取',
  '提取抖音/B站/快手等平台的视频口播文案（语音转文字）。下载视频后通过AI语音识别将口播内容转写成文字。提取完成后自动清理临时文件。适用于：灵感采集、竞品分析、内容参考、字幕提取等场景。',
  '内容采集',
  ARRAY['抖音', '视频', '文案', '提取', '转写', '语音识别', '字幕', 'B站', '快手', 'douyin', 'transcript', '灵感', '采集', '参考'],
  '你正在执行「视频文案提取」任务。

**功能说明**: 从抖音/B站/快手等平台下载视频，通过AI语音识别将视频中的语音转为文字文案。提取完成后自动清理临时文件。

**使用场景**:
- 用户分享了一个视频链接，想提取里面说了什么
- 用户想参考某个视频的文案风格
- 用户需要批量提取多个视频的文字内容
- 用户想做竞品分析，需要收集竞品视频的文案

**执行规则**:
1. 从用户消息中提取视频链接（支持 douyin.com、bilibili.com、kuaishou.com、ixigua.com 等）
2. 调用 extract_content 或 douyin_transcript 工具提取文案
3. 如果链接无法直接提取，尝试 fast_only=true 获取页面描述
4. 将提取的文案清晰地呈现给用户，标注视频标题和来源链接
5. 提取完成后自动删除下载的视频和音频文件

**质量标准**:
- 完整性：必须输出视频标题+完整文案，保留说话人的段落节奏
- 准确性：ASR结果需校对明显错字，标注低置信度片段[?]
- 来源标注：标注平台+视频链接+提取方式（🎙️语音识别）
- 降级处理：视频下载失败 → 尝试页面摘要；ASR失败 → 返回页面描述
- 隐私保护：提取完成后自动清理临时下载的视频和音频

**自检清单**（返回前逐项确认）:
- [ ] 已标注视频标题和来源链接
- [ ] 已说明提取方式
- [ ] 文案有结构分段（不是一整坨文字）
- [ ] 失败时已告知用户原因并给出替代建议',
  '{
    "type": "object",
    "properties": {
      "urls": {"type": "string", "description": "要提取的视频链接，多个用换行或逗号分隔"},
      "fast_only": {"type": "boolean", "description": "是否仅快速提取（不下载视频，只获取页面描述）"}
    },
    "required": ["urls"]
  }'::jsonb,
  ARRAY['视频', '文案', '抖音', 'B站', '快手', '口播', '转文字', '语音转文字', '下载', '识别'],
  '[
    {"tool": "extract_content"},
    {"tool": "douyin_transcript"}
  ]'::jsonb,
  '1.0.0',
  'official'
) ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  prompt_template = EXCLUDED.prompt_template,
  trigger_keywords = EXCLUDED.trigger_keywords,
  steps = EXCLUDED.steps;

-- ── 3. 为所有现有用户自动安装 ──

INSERT INTO user_skills (user_id, skill_id, enabled)
SELECT u.id, s.id, true
FROM users u
CROSS JOIN skills s
WHERE s.name IN ('extract_content', 'douyin_transcript')
  AND NOT EXISTS (
    SELECT 1 FROM user_skills us
    WHERE us.user_id = u.id AND us.skill_id = s.id
  );

-- ── 4. 触发器：新用户注册时自动安装默认官方技能 ──

CREATE OR REPLACE FUNCTION auto_install_default_skills()
RETURNS trigger AS $$
BEGIN
  INSERT INTO user_skills (user_id, skill_id, enabled)
  SELECT NEW.id, s.id, true
  FROM skills s
  WHERE s.visibility = 'official'
    AND s.name IN ('extract_content', 'douyin_transcript')
    AND NOT EXISTS (
      SELECT 1 FROM user_skills us
      WHERE us.user_id = NEW.id AND us.skill_id = s.id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 只在触发器不存在时创建
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_install_default_skills'
  ) THEN
    CREATE TRIGGER trg_auto_install_default_skills
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_install_default_skills();
  END IF;
END;
$$;
