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
    model: 'wanx2.1-t2i-turbo',
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

  // 提交异步任务
  const submitRes = await fetch(
    `${DASHSCOPE_BASE}/services/aigc/text2image/image-synthesis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    },
  );

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`DashScope 图片编辑失败: ${submitRes.status} ${errText}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('图片编辑失败: 未获取到任务 ID');

  // 轮询结果
  let outputUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (data.output?.task_status === 'SUCCEEDED') {
      outputUrl = data.output?.results?.[0]?.url || null;
      break;
    }
    if (data.output?.task_status === 'FAILED') {
      throw new Error(data.output?.message || '图片编辑失败');
    }
  }

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
