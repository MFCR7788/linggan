// AI Services - Content Generation (Summary, Copywriting, Oral Script)

import { callDeepSeek } from './chat';
import type { SummaryResult } from './types';

// ====== AI 总结灵感内容 ======

export async function summarizeContent(
  content: string,
  contentType: string
): Promise<SummaryResult> {
  const prompt = `请对以下${contentType}内容进行分析和总结：

${content}

请以JSON格式返回以下内容：
{
  "title": "自动生成的标题",
  "summary": "内容的详细总结",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "tags": ["相关标签1", "相关标签2"],
  "creationSuggestions": ["创作建议1", "创作建议2"],
  "reuseScore": 80
}

只返回JSON，不要有其他文字。`;

  try {
    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 1500 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SummaryResult;
    }
  } catch (e) {
    console.error('AI summarization failed:', e);
  }

  return {
    title: '内容标题',
    summary: content.substring(0, 200),
    keyPoints: ['要点1', '要点2'],
    tags: ['灵感'],
    creationSuggestions: ['可以基于此内容创作小红书文案'],
    reuseScore: 70,
  };
}

// ====== AI 生成文案 ======

export async function generateCopywriting(
  inspirations: { title?: string; originalText?: string; aiSummary?: string }[],
  type: string,
  style: string,
  noAiTaste: boolean = false,
  n: number = 1,
  industryInstruction?: string,
  userInstruction?: string
): Promise<string | string[]> {
  const inspirationText = inspirations.map((i) => {
    const parts: string[] = [];
    if (i.title) parts.push(`【标题】${i.title}`);
    if (i.aiSummary) parts.push(`【AI分析摘要】${i.aiSummary}`);
    if (i.originalText && !i.aiSummary) parts.push(`【原文】${i.originalText}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  let styleInstruction = '';
  if (noAiTaste) {
    styleInstruction =
      '要求：去掉AI味，使用更自然的口语化表达，增加个人化的语气，避免过于工整的排比和模板化表达。';
  }

  const industryBlock = industryInstruction ? `\n${industryInstruction}\n` : '';
  const userBlock = userInstruction ? `\n【用户特别要求】\n${userInstruction}\n` : '';

  const basePrompt = (angle: string) => `请基于以下灵感内容创作一篇${type}，风格要求：${style}。${angle}
${industryBlock}${userBlock}
灵感内容：
${inspirationText}

${styleInstruction}

请直接输出最终文案内容。`;

  try {
    if (n <= 1) {
      return await callDeepSeek(basePrompt(''), { temperature: 0.8, maxTokens: 1500 });
    }
    // 批量生成：不同角度 + 不同 temperature
    const angles = [
      '请从热门爆款角度撰写',
      '请从专业深度角度撰写',
      '请从情感共鸣角度撰写',
      '请从新奇有趣角度撰写',
      '请从实用干货角度撰写',
    ];
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        callDeepSeek(basePrompt(angles[i % angles.length]), {
          temperature: 0.7 + (i * 0.1),
          maxTokens: 1500,
        })
      )
    );
    return results;
  } catch (e) {
    console.error('Copywriting generation failed:', e);
    return n <= 1
      ? '✨ 这是一篇精彩的文案内容（模拟数据）...'
      : Array.from({ length: n }, (_, i) => `版本 ${i + 1}：这是一篇精彩的文案内容...`);
  }
}

// ====== 数字人口播脚本生成 ======

const ORAL_SCRIPT_STYLES: Record<string, string> = {
  oral: '自然口播风格，像在和朋友聊天，语气亲切自然，有停顿和语气词',
  livestream: '直播带货风格，热情有感染力，多用感叹句和号召性语言，"快来"、"千万不要错过"',
  news: '新闻播报风格，正式专业，语句工整，信息密度高',
  emotional: '情感讲述风格，温柔舒缓，有故事感和代入感',
};

export async function generateOralScript(params: {
  topic: string;
  style?: string;
  language?: string;
  targetLength?: number;
  variantCount?: number;
  inspirations?: { title?: string; original_text?: string; ai_summary?: string }[];
}): Promise<string[]> {
  const { topic, style = 'oral', language = 'zh', targetLength = 500, variantCount = 1, inspirations = [] } = params;

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };
  const langLabel = langLabels[language] || '中文';

  const styleDesc = ORAL_SCRIPT_STYLES[style] || ORAL_SCRIPT_STYLES.oral;

  let materialContext = '';
  if (inspirations.length > 0) {
    materialContext = '\n参考素材：\n' + inspirations.map((insp, i) => {
      const parts = [`素材${i + 1}：`];
      if (insp.title) parts.push(`标题：${insp.title}`);
      if (insp.original_text) parts.push(`原文：${insp.original_text}`);
      if (insp.ai_summary) parts.push(`摘要：${insp.ai_summary}`);
      return parts.join('\n');
    }).join('\n\n');
  }

  const angles = variantCount > 1
    ? ['请从开头引入的角度撰写', '请从核心观点展开的角度撰写', '请从案例故事的角度撰写', '请从问题解决的角度撰写', '请从总结升华的角度撰写']
    : [''];

  try {
    const results = await Promise.all(angles.slice(0, Math.max(variantCount, 1)).map(angle =>
      callDeepSeek(
        `你是专业的短视频口播脚本写手。请根据以下要求写出一个数字人口播脚本。

主题：${topic}
风格要求：${styleDesc}
目标字数：约${targetLength}字
输出语言：${langLabel}
${angle ? `角度要求：${angle}` : ''}${materialContext}

重要要求：
1. 纯口语化表达，适合朗读，不要书面语
2. 不要使用markdown格式（不要标题、列表、符号、加粗等）
3. 短句为主，每句不超过25个字
4. 加入自然的语气停顿和转折词
5. 开头要有吸引力，结尾有总结或互动
6. 直接输出脚本文字，不要任何其他说明或前缀`,
        { temperature: 0.8, maxTokens: 2000 }
      )
    ));

    return results.map(r => r.replace(/^["']|["']$/g, '').trim());
  } catch (e) {
    console.error('Oral script generation failed:', e);
    return [`大家好，今天我们来聊聊${topic}。这个话题非常有趣，让我来为大家详细介绍一下。\n\n首先，我们需要了解${topic}的基本概念。很多人可能对这个领域还不太熟悉，但其实它与我们的生活息息相关。\n\n那么，${topic}到底能给我们带来什么价值呢？让我们一探究竟。`];
  }
}
