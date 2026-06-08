// AI 图片编辑 API — 使用 Qwen-Image-Edit 模型进行真正的图片编辑
// POST { action: 'remove-bg' | 'enhance' | 'expand', imageUrl: string, prompt?: string }
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { getDashScopeApiKey } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

const DASHSCOPE_MM_BASE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

interface EditRequest {
  action: 'remove-bg' | 'enhance' | 'expand';
  imageUrl: string;
  prompt?: string;
}

const ACTION_PROMPTS: Record<string, { prompt: string; negative: string }> = {
  'remove-bg': {
    prompt: 'Remove the background completely. Replace with pure white background. Keep the main subject 100% intact — preserve all details, edges, colors, and textures exactly as they are.',
    negative: 'background remnants, gray background, subject altered, missing parts, blurry edges, subject cropped',
  },
  'enhance': {
    prompt: 'Enhance this image to higher quality. Improve sharpness, fine details, and color vibrancy. Keep the exact same composition, all subjects, and every element completely unchanged.',
    negative: 'blurry, low quality, distorted, different composition, changed subjects, missing elements',
  },
  'expand': {
    prompt: 'Expand the canvas outward to show more of the surrounding scene. Keep the original image content centered and completely unchanged. Naturally extend the scene to fill the new areas, matching the original style, lighting, and atmosphere.',
    negative: 'seam, visible border, frame, distorted original, cropped original, changed original content',
  },
};

async function editImage(
  imageUrl: string,
  action: string,
  customPrompt?: string,
): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY 未配置');

  const defaults = ACTION_PROMPTS[action] || ACTION_PROMPTS['enhance'];

  const body = {
    model: 'qwen-image-edit-plus',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image: imageUrl },
            { text: customPrompt || defaults.prompt },
          ],
        },
      ],
    },
    parameters: {
      negative_prompt: defaults.negative,
      watermark: false,
      prompt_extend: true,
    },
  };

  const res = await fetch(DASHSCOPE_MM_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`图片编辑失败: ${res.status} ${errText}`);
  }

  const data = await res.json();

  if (data.code || data.message) {
    throw new Error(data.message || `API 错误: ${data.code}`);
  }

  const contents = data.output?.choices?.[0]?.message?.content;
  if (!contents || !Array.isArray(contents)) {
    throw new Error('图片编辑未返回结果');
  }

  const resultImage = contents.find((c: { image?: string }) => c.image)?.image;
  if (!resultImage) {
    throw new Error('图片编辑未返回图片 URL');
  }

  return resultImage;
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
    const creditCost = action === 'enhance' ? 3 : action === 'expand' ? 5 : 2;
    await consume(user.id, creditCost, 'ai_image_edit', `图片编辑: ${action}`);

    const resultUrl = await editImage(imageUrl, action, prompt);

    return createApiResponse(
      { url: resultUrl, action },
      '图片编辑完成',
    );
  } catch (e: unknown) {
    if (e instanceof InsufficientCreditsError) {
      return createApiError(
        `余额不足: 需要 ${e.required} 灵力，当前 ${e.available}`,
        402,
      );
    }
    const msg = e instanceof Error ? e.message : '图片编辑失败';
    console.error('[ImageEdit]', msg);
    return createApiError(msg, 500);
  }
});
