// 多平台改写 API — 一键生成小红书/抖音/公众号/微博版本
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { callDeepSeek, logAiUsage } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { content } = await request.json();
    if (!content || content.trim().length === 0) {
      return createApiError('请提供原文内容', 400);
    }

    const prompt = `请将以下内容改写为四个主流平台的版本。每个版本要保留核心信息，但调整表达方式、格式和语气来匹配对应平台的风格。

原文：
${content.substring(0, 1500)}

请严格按照以下JSON格式返回（不要加markdown代码块标记）：
{
  "xiaohongshu": "小红书版本：用emoji装饰、短段落、口语化表达、结尾加3-5个相关标签（#标签格式）",
  "douyin": "抖音版本：短句为主、开头要有抓人的钩子、节奏快、适合配音念白",
  "wechat_article": "公众号版本：长文结构，分2-3个小标题章节，专业有深度",
  "weibo": "微博版本：精炼在140字以内，有话题感，可加表情符号"
}`;

    const text = await callDeepSeek(prompt, { temperature: 0.8, maxTokens: 2000 });

    // 解析 JSON
    let versions: Record<string, string> = {};
    try {
      // 尝试去除可能的 markdown 代码块标记
      let cleanText = text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      versions = JSON.parse(cleanText);
    } catch {
      // 解析失败时返回原文作为降级
      versions = {
        xiaohongshu: text.substring(0, 500) || content,
        douyin: content,
        wechat_article: content,
        weibo: content,
      };
    }

    await logAiUsage(user.id, 'copywriting', 800);

    return createApiResponse({ versions }, '多平台改写完成');
  } catch (error) {
    console.error('Multi-platform rewrite error:', error);
    return createApiError('改写失败', 500);
  }
}
