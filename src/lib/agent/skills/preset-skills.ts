// Agent 预设技能 — 独立于 Combo 的独立 Skill 定义
// 包含视频文案提取、联网搜索等通用能力
import type { SkillDefinition } from "@/lib/assistant/types";

const PRESET_SKILLS: SkillDefinition[] = [
  {
    id: "extract_content",
    name: "extract_content",
    displayName: "📋 多平台内容提取",
    description:
      "从抖音、小红书、B站、今日头条、腾讯新闻、快手、微博等平台的链接中提取文字内容或视频语音文案。支持单个链接或批量提取，自动识别平台选择最佳提取方式。适用于：灵感采集、竞品分析、内容参考、视频文案提取等场景。",
    category: "内容采集",
    tags: [
      "抖音", "小红书", "B站", "今日头条", "腾讯新闻", "快手", "微博", "知乎",
      "视频", "文案", "提取", "转写", "语音识别", "字幕",
      "douyin", "xiaohongshu", "bilibili", "toutiao",
      "灵感", "采集", "下载", "参考",
    ],
    promptTemplate: `你正在执行「多平台内容提取」任务。

**功能说明**: 从抖音/B站/小红书/快手/今日头条/腾讯新闻/微博/知乎等平台提取链接中的文字内容或视频文案（含语音转文字）。

**支持的平台**:
- 🎙️ 视频平台（下载视频→语音识别→文字）: 抖音、B站、快手、微博视频、今日头条视频（西瓜视频）
- 📄 文字平台（智能提取正文）: 小红书笔记、今日头条文章、腾讯新闻、知乎、微信公众号
- 🌐 通用网页: jina.ai Reader 自动提取正文

**使用场景**:
- 用户分享了一个视频链接，想提取视频里的口播文案
- 用户想参考某篇文章/笔记的内容结构
- 用户需要批量提取多个平台的链接内容进行竞品分析
- 用户想做内容采集，收集不同平台的热门内容文案

**执行规则**:
1. 从用户消息中提取所有链接（可混合不同平台）
2. 调用 extract_content 工具提取内容
3. 如果用户只想要摘要，设置 fast_only=true 快速获取标题和描述
4. 将提取的内容清晰呈现，标注平台、来源和提取方式
5. 如果用户要求分析文案，在提取后进一步分析内容结构、风格和关键信息`,
    boundTools: ["extract_content"],
    version: "1.0.0",
    visibility: "official",
    installCount: 0,
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
  },
  {
    id: "douyin_transcript",
    name: "douyin_transcript",
    displayName: "📹 视频文案提取",
    description:
      "提取抖音/B站/快手等平台的视频文案（语音转文字）。支持单个链接或批量提取，自动下载视频并用AI语音识别转写成文字。适用于：灵感采集、竞品分析、内容参考、字幕提取等场景。（推荐使用多平台内容提取工具获得更广的平台覆盖）",
    category: "内容采集",
    tags: [
      "抖音",
      "视频",
      "文案",
      "提取",
      "转写",
      "语音识别",
      "字幕",
      "B站",
      "快手",
      "douyin",
      "transcript",
      "灵感",
      "采集",
      "下载",
      "参考",
    ],
    promptTemplate: `你正在执行「视频文案提取」任务。

**功能说明**: 从抖音/B站/快手等平台下载视频，通过AI语音识别将视频中的语音转为文字文案。

**使用场景**:
- 用户分享了一个视频链接，想提取里面说了什么
- 用户想参考某个视频的文案风格
- 用户需要批量提取多个视频的文字内容
- 用户想做竞品分析，需要收集竞品视频的文案

**执行规则**:
1. 从用户消息中提取视频链接（支持 douyin.com、bilibili.com、kuaishou.com、ixigua.com 等）
2. 调用 douyin_transcript 或 extract_content 工具提取文案
3. 如果链接无法直接提取，尝试 fast_only=true 获取页面描述
4. 将提取的文案清晰地呈现给用户，标注视频标题和来源链接
5. 如果用户要求分析文案，在提取后进一步分析内容结构和风格`,
    boundTools: ["douyin_transcript", "extract_content"],
    version: "1.0.0",
    visibility: "official",
    installCount: 0,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
  },
  {
    id: "douyin_search",
    name: "douyin_search",
    displayName: "🔍 抖音搜索",
    description:
      "在抖音平台搜索视频、用户、话题等内容，获取热门趋势和创作灵感。适合了解某个话题在抖音上的热度、找到相关创作者、分析内容趋势等场景。",
    category: "内容采集",
    tags: ["抖音", "搜索", "热门", "趋势", "话题", "douyin", "创作者", "发现"],
    promptTemplate: `你正在执行「抖音搜索」任务。

**功能说明**: 在抖音平台搜索视频、用户、话题等内容。

**使用场景**:
- 用户想了解某个话题在抖音上的热度
- 用户想找到某个领域的抖音创作者
- 用户想分析抖音上的内容趋势

**执行规则**:
1. 根据用户需求确定搜索关键词和类型（综合/视频/用户/话题）
2. 调用 douyin_search 工具执行搜索
3. 将有价值的结果整理后呈现给用户`,
    boundTools: ["douyin_search"],
    version: "1.0.0",
    visibility: "official",
    installCount: 0,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:00Z",
  },
];

/** 获取所有预设技能 */
export function getAllPresetSkills(): SkillDefinition[] {
  return PRESET_SKILLS;
}

/** 追加预设技能到已有的 Skill 数组 */
export function appendPresetSkills(skills: SkillDefinition[]): SkillDefinition[] {
  const existingIds = new Set(skills.map((s) => s.id));
  for (const ps of PRESET_SKILLS) {
    if (!existingIds.has(ps.id)) {
      skills.push(ps);
    }
  }
  return skills;
}
