import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { callDeepSeek } from '@/lib/ai-services';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

// POST /api/ai/punctuate — 为无标点中文文本加标点
export const POST = withAuth(async ({ request, user }) => {
  const { text } = await request.json();
  if (!text || typeof text !== 'string') return createApiError('缺少文本', 400);

  const creditCost = CREDIT_COSTS.ai_text.perCall;
  try {
    await consume(user.id, creditCost, 'ai_punctuate', 'AI 标点恢复', { textLen: text.length });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
        { status: 402 }
      );
    }
    throw e;
  }

  try {
    const result = await callDeepSeek(
      `你是中文语音识别后处理助手。请对以下语音识别结果做两件事：
1. 添加正确的标点符号（句号、逗号、问号、感叹号、顿号、冒号、引号等）
2. 纠正语音识别常见错误：同音字/近音字（如"在么"→"在吗"、"稀望"→"希望"、"公作"→"工作"）、漏字、多字
注意：保持原意不变，不要改写或添加额外内容。直接返回处理后的文本：\n\n${text}`,
      { temperature: 0.1, maxTokens: 1000 }
    );
    return createApiResponse({ text: result.trim() });
  } catch (e) {
    console.error('标点恢复失败:', e);
    return createApiError('标点恢复失败', 500);
  }
});
