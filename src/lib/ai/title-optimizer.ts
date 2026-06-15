// 多平台标题优化器 — 根据视频内容为各平台生成最优标题
// 纯 LLM 驱动，无 FFmpeg 依赖

import { callDeepSeek } from '@/lib/ai-services';

export type Platform = '抖音' | '小红书' | 'B站' | '视频号' | '快手' | 'YouTube';
export type TitleType = '悬念型' | '信息型' | '情绪型' | '痛点型' | '教程型' | '对比型' | '互动型';

const PLATFORM_RULES: Record<Platform, { maxChars: number; style: string; tips: string }> = {
  '抖音': { maxChars: 30, style: 'hook + 悬念 + emoji，口语化，短平快', tips: '前5字决定完播率，用反问/悬念开头，加emoji增加视觉冲击' },
  '小红书': { maxChars: 20, style: '关键词密集 + 痛点 + emoji，精致排版', tips: '标题就是正文第一行，关键词越多搜索曝光越高，用分隔符|排版' },
  'B站': { maxChars: 80, style: '信息量 + 关键词 + 标签，可稍长', tips: '可加分区标签如【护肤】，标题信息量要大，可以两段式：前半吸引+后半说明' },
  '视频号': { maxChars: 30, style: '温和 + 正能量 + 贴近生活，中年受众', tips: '避免过度夸张，强调实用性和生活感，适合30-50岁受众' },
  '快手': { maxChars: 20, style: '直白 + 接地气 + 老铁风格，亲切感', tips: '口语化，接地气，像跟朋友聊天，多用"老铁""姐妹们"等称呼' },
  'YouTube': { maxChars: 100, style: 'SEO 关键词 + 英文 + 信息完整', tips: '前50字符包含核心关键词，英文标题加分，可带|分隔符，考虑搜索优化' },
};

const TITLE_TYPES: Record<TitleType, string> = {
  '悬念型': '制造好奇，让用户忍不住点开，如"用了7天，我的皮肤变成这样…"',
  '信息型': '客观陈述，突出数据和事实，如"精华液实测｜干皮星人的7天护肤记录"',
  '情绪型': '激发情感共鸣，如"熬夜党的救命精华液！"',
  '痛点型': '直击用户痛点，如"黄皮看过来！这个精华液真的能白"',
  '教程型': '教用户怎么做，如"30秒学会正确涂精华液"',
  '对比型': '前后对比/竞品对比，如"同样是精华液，100块和1000块差在哪"',
  '互动型': '引导用户评论互动，如"你的精华液用对了吗？评论区告诉我"',
};

export interface TitleCandidate {
  text: string;
  type: TitleType;
  score: number; // 1-5
  reasoning?: string;
}

export interface PlatformTitles {
  platform: Platform;
  candidates: TitleCandidate[];
}

export interface OptimizeInput {
  contentText?: string;    // 直接粘贴的文案
  videoUrl?: string;       // 或视频 URL（暂不下载转写，由调用方先转写再传入 contentText）
  platforms?: Platform[];
  titleTypes?: TitleType[];
  customContext?: string;  // 额外上下文（如产品名、品牌调性）
}

export interface OptimizeResult {
  platforms: PlatformTitles[];
  contentSummary: string;
  keywords: string[];
}

function buildPrompt(input: OptimizeInput): string {
  const platforms = input.platforms || ['抖音', '小红书', 'B站'];
  const types = input.titleTypes || ['悬念型', '信息型', '情绪型', '痛点型', '教程型'];

  const platformRules = platforms.map((p) => {
    const r = PLATFORM_RULES[p];
    return `${p}：≤${r.maxChars}字，风格：${r.style}。${r.tips}`;
  }).join('\n');

  const typeDesc = types.map((t) => `- ${t}：${TITLE_TYPES[t]}`).join('\n');

  return `你是一个短视频标题创作专家。根据以下内容，为指定平台生成最优标题。

## 内容
${input.contentText || '（无具体内容，根据上下文推断）'}
${input.customContext ? `\n额外信息：${input.customContext}` : ''}

## 平台规则
${platformRules}

## 标题类型
${typeDesc}

## 输出格式
返回 JSON，不要包含 markdown 代码块标记：
{
  "contentSummary": "内容一句话总结（30字内）",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "platforms": [
    {
      "platform": "抖音",
      "candidates": [
        { "text": "标题文字", "type": "悬念型", "score": 5, "reasoning": "短评" }
      ]
    }
  ]
}

要求：
1. 每个平台生成 ${Math.min(types.length, 5)} 个标题，type 不重复
2. score 1-5 评估标题效果（5=最佳）
3. 标题要符合各平台字数限制，不要超字数
4. 标题要有实际吸引力，不要空洞口号
5. emoji 要恰到好处，不要过度使用`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

export async function optimizeTitles(input: OptimizeInput): Promise<OptimizeResult> {
  const userPrompt = buildPrompt(input);
  const systemPrompt = '你是短视频标题创作专家。只返回 JSON，不包含任何解释。';
  const response = await callDeepSeek(
    `${systemPrompt}\n\n${userPrompt}`,
    { temperature: 0.7, maxTokens: 4000 },
  );

  try {
    const json = extractJson(response);
    const result = JSON.parse(json) as OptimizeResult;
    return result;
  } catch {
    throw new Error(`标题生成解析失败: ${response.substring(0, 200)}`);
  }
}
