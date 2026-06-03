// AI 文案的"智能助手"端点
// 把用户输入 + 灵感素材提炼成 50-150 字的"核心信息"（用于喂给 AI 文案生成）
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { callDeepSeek } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

interface RefineBody {
  inspirations?: Array<{ title?: string; originalText?: string; aiSummary?: string }>;
  userInput?: string;
}

export const POST = withAuth(async ({ request, user: _user }) => {
  try {
    const body: RefineBody = await request.json().catch(() => ({}));
    const { inspirations = [], userInput = '' } = body;

    if (!userInput.trim() && inspirations.length === 0) {
      return createApiError('需要至少提供用户输入或灵感素材', 400);
    }

    const inspContext = inspirations
      .filter(Boolean)
      .map((i, idx) => {
        const parts = [
          i.title ? `标题：${i.title}` : '',
          i.aiSummary ? `AI摘要：${i.aiSummary}` : '',
          i.originalText ? `原文：${i.originalText}` : '',
        ].filter(Boolean);
        return parts.length > 0 ? `[素材${idx + 1}] ${parts.join(' | ')}` : '';
      })
      .filter(Boolean)
      .join('\n');

    const prompt = `你是一个内容策划专家。用户的"用户输入"和"灵感素材"可能比较零散、模糊、缺少关键信息。请你把它们提炼成一段 50-150 字的"核心信息"——清晰、具体、能直接驱动后续的文案创作。

要求：
1. 提炼出明确的主题/卖点/受众
2. 突出用户输入里的关键约束（行业、平台、风格偏好等）
3. 整合素材里的可复用信息
4. 适合作为"AI 写一篇文案"的种子描述
5. 直接输出提炼后的内容，不要有"核心信息："等前缀

【用户输入】
${userInput.trim() || '（无）'}

【灵感素材】
${inspContext || '（无）'}

只输出提炼后的内容。`;

    try {
      const result = await callDeepSeek(prompt, { temperature: 0.4, maxTokens: 250 });
      const refined = result.trim().replace(/^["「『]+|["」』]+$/g, '').slice(0, 500);
      return createApiResponse({ refined, source: 'ai' }, 'Refined');
    } catch (e) {
      // fallback：原样返回
      return createApiResponse({ refined: userInput.trim(), source: 'fallback' }, 'Fallback');
    }
  } catch (error) {
    console.error('Refine copywriting error:', error);
    return createApiError('提炼失败', 500);
  }
});
