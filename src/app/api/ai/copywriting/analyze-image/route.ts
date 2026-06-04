// AI 文案 · 图片视觉理解 API(Step 1 第三层:粘贴/拖拽图片后调用)
// 输入: { imageUrl, prompt? }
// 输出: { description, text, tags, analyzedAt }

import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { callDoubaoVision } from '@/lib/ai-services';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  let body: { imageUrl?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return createApiError('请求体不是合法 JSON', 400);
  }

  const { imageUrl, prompt } = body;
  if (!imageUrl || typeof imageUrl !== 'string') {
    return createApiError('imageUrl 必填', 400);
  }
  if (!/^https?:\/\//.test(imageUrl)) {
    return createApiError('imageUrl 必须是 http(s) 链接', 400);
  }

  const creditCost = CREDIT_COSTS.ai_extract.image;
  try {
    await consume(user.id, creditCost, 'ai_analyze_image', 'AI 图片分析', { imageUrl: imageUrl.substring(0, 200) });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
        { status: 402 }
      );
    }
    throw e;
  }

  // 默认 prompt 偏文案创作场景
  const finalPrompt = prompt?.trim() ||
    '请分析这张图片,提取其中的关键文字、视觉信息和可用于文案创作的核心要点。以 JSON 格式返回:{"description": "详细图片描述", "text": "图片中的文字内容(若无则空字符串)", "tags": ["标签1", "标签2", "标签3"]}';

  try {
    const result = await callDoubaoVision(imageUrl, finalPrompt);
    return createApiResponse(
      {
        description: result.description,
        text: result.text || '',
        tags: result.tags || [],
        analyzedAt: new Date().toISOString(),
      },
      '图片分析完成'
    );
  } catch (e: any) {
    console.error('[analyze-image] 失败:', e?.message || e);
    return createApiError('图片分析失败,请稍后重试', 502);
  }
});
