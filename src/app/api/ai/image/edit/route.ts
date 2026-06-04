// AI 图片编辑 API
// POST { action: 'remove-bg' | 'enhance' | 'expand', imageUrl: string, prompt?: string }
import { NextRequest } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { getDashScopeApiKey } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1';

interface EditRequest {
  action: 'remove-bg' | 'enhance' | 'expand';
  imageUrl: string;
  prompt?: string;
}

async function callDashScopeImageEdit(
  action: string,
  imageUrl: string,
  prompt?: string,
): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY 未配置');

  const body: Record<string, unknown> = {
    model: 'wan2.2-image',
    input: {
      ref_image_url: imageUrl,
    },
  };

  const input: Record<string, unknown> = { ref_image_url: imageUrl };

  if (action === 'remove-bg') {
    input.prompt = 'Remove the background. Keep only the main subject. Make the background transparent or white.';
  } else if (action === 'enhance') {
    input.prompt = prompt || 'Enhance this image to higher quality. Improve resolution, sharpness, and colors. Keep the same composition and subject.';
    input.negative_prompt = 'blurry, low quality, distorted, ugly';
  } else if (action === 'expand') {
    input.prompt = prompt || 'Expand this image outward to a wider view. Fill in the surrounding space naturally. Keep the original content centered.';
    input.negative_prompt = 'seam, border, frame, distorted edges';
    body.parameters = { size: '1664*928' };
  }

  body.input = input;

  const response = await fetch(
    `${DASHSCOPE_BASE}/services/aigc/image-generation/image-synthesis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DashScope 图片编辑失败: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const outputUrl =
    result?.output?.results?.[0]?.url ||
    result?.output?.result_url ||
    result?.data?.url;

  if (!outputUrl) {
    throw new Error('DashScope 未返回图片 URL');
  }

  return outputUrl;
}

export const POST = withAuth(async ({ request, user }) => {
  const body: EditRequest = await request.json();
  const { action, imageUrl, prompt } = body;

  if (!action || !imageUrl) {
    return createApiError('action 和 imageUrl 必填', 400);
  }

  const allowedActions = ['remove-bg', 'enhance', 'expand'];
  if (!allowedActions.includes(action)) {
    return createApiError('无效的 action，支持: remove-bg, enhance, expand', 400);
  }

  try {
    // 扣点
    const creditCost = action === 'enhance' ? 3 : action === 'expand' ? 5 : 2;
    await consume(user.id, creditCost, 'ai_image_edit', `图片编辑: ${action}`);

    const resultUrl = await callDashScopeImageEdit(action, imageUrl, prompt);

    return createApiResponse(
      { url: resultUrl, action },
      '图片编辑完成',
    );
  } catch (e: unknown) {
    if (e instanceof InsufficientCreditsError) {
      return createApiError(
        `余额不足: 需要 ${e.required} credits，当前 ${e.available}`,
        402,
      );
    }
    const msg = e instanceof Error ? e.message : '图片编辑失败';
    console.error('[ImageEdit]', msg);
    return createApiError(msg, 500);
  }
});
