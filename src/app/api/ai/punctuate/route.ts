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
      `请为以下无标点中文文本添加正确的标点符号（句号、逗号、问号、感叹号等），不要修改任何文字内容，只加标点：\n\n${text}`,
      { temperature: 0.1, maxTokens: 500 }
    );
    return createApiResponse({ text: result.trim() });
  } catch (e) {
    console.error('标点恢复失败:', e);
    return createApiError('标点恢复失败', 500);
  }
});
