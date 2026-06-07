// 图片增强 API — 使用 Qwen-Image-Edit 模型进行真正的图片编辑
// 支持: 超分辨率增强 / 背景替换 / 风格迁移
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { getDashScopeApiKey } from '@/lib/runtime-config';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

const DASHSCOPE_MM_BASE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const STYLE_TRANSFER_PRESETS: Record<string, { label: string; prompt: string; negative: string }> = {
  watercolor: {
    label: '水彩手绘',
    prompt: 'Transform into watercolor painting style. Soft brushstrokes, artistic, hand-painted look. Preserve the original composition and main elements.',
    negative: 'digital art, sharp lines, photorealism, 3D render',
  },
  illustration: {
    label: '插画风格',
    prompt: 'Transform into digital illustration style. Flat colors, clean lines, modern illustration. Preserve the original composition and main elements.',
    negative: 'photorealistic, 3D, sketch, watercolor',
  },
  cyberpunk: {
    label: '赛博朋克',
    prompt: 'Transform into cyberpunk style. Neon lights, futuristic city, high contrast, dark atmosphere. Preserve the original composition and main elements.',
    negative: 'natural lighting, daylight, rural, vintage, bright',
  },
  '3d_render': {
    label: '3D渲染',
    prompt: 'Transform into 3D rendered style. Octane render quality, realistic materials, cinematic lighting. Preserve the original composition and main elements.',
    negative: '2D, flat, sketch, watercolor, cartoon',
  },
  sketch: {
    label: '素描风格',
    prompt: 'Transform into pencil sketch style. Monochrome, detailed linework, artistic drawing. Preserve the original composition and main elements.',
    negative: 'color, photorealistic, digital art, 3D render',
  },
  vintage: {
    label: '复古胶片',
    prompt: 'Transform into vintage film photography style. Warm tones, film grain, nostalgic look. Preserve the original composition and main elements.',
    negative: 'digital clean, modern, neon, cyberpunk, sharp',
  },
};

async function editWithQwen(imageUrl: string, prompt: string, negativePrompt?: string): Promise<string> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY 未配置');

  const body = {
    model: 'qwen-image-edit-plus',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image: imageUrl },
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      negative_prompt: negativePrompt || '模糊, 低质量, 变形, 失真',
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
    throw new Error(`图片增强失败: ${res.status} ${errText}`);
  }

  const data = await res.json();

  if (data.code || data.message) {
    throw new Error(data.message || `API 错误: ${data.code}`);
  }

  const contents = data.output?.choices?.[0]?.message?.content;
  if (!contents || !Array.isArray(contents)) {
    throw new Error('图片增强未返回结果');
  }

  const resultImage = contents.find((c: { image?: string }) => c.image)?.image;
  if (!resultImage) {
    throw new Error('图片增强未返回图片 URL');
  }

  return resultImage;
}

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { imageUrl, mode, options } = await request.json();

    if (!imageUrl) {
      return createApiError('请提供图片URL', 400);
    }

    if (!mode || !['upscale', 'bg_replace', 'style_transfer'].includes(mode)) {
      return createApiError('请选择增强模式：upscale / bg_replace / style_transfer', 400);
    }

    const creditCost = CREDIT_COSTS.ai_image.perImage;
    try {
      await consume(user.id, creditCost, 'ai_image', `AI 图片增强 ${mode}`, { mode });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: creditCost, available: e.available },
          },
          { status: 402 },
        );
      }
      throw e;
    }

    let prompt: string;
    let negativePrompt: string;
    let enhanceLabel: string;

    switch (mode) {
      case 'upscale': {
        enhanceLabel = '超分辨率增强';
        prompt = 'Enhance this image to maximum quality. Ultra high definition, crystal clear details, vibrant colors, professional photography quality. Keep the exact composition, all subjects, and every element completely unchanged.';
        negativePrompt = 'blurry, pixelated, low resolution, noise, artifacts, distorted, different composition, changed subjects';
        break;
      }

      case 'bg_replace': {
        const newBg = options?.newBackground || 'clean white studio background';
        enhanceLabel = '背景替换';
        prompt = `Replace the background with: ${newBg}. Keep the main subject 100% intact — preserve all details, edges, colors, and textures. Seamless composition with natural lighting matching the new background.`;
        negativePrompt = 'subject changed, subject distorted, mismatched lighting, harsh edges, background remnants, subject cropped';
        break;
      }

      case 'style_transfer': {
        const styleKey = options?.style || 'watercolor';
        const stylePreset = STYLE_TRANSFER_PRESETS[styleKey] || STYLE_TRANSFER_PRESETS['watercolor'];
        enhanceLabel = `风格迁移 · ${stylePreset.label}`;
        prompt = stylePreset.prompt;
        negativePrompt = stylePreset.negative;
        break;
      }

      default:
        return createApiError('未知的增强模式', 400);
    }

    const resultUrl = await editWithQwen(imageUrl, prompt, negativePrompt);

    return createApiResponse({
      mode,
      enhanceLabel,
      originalImageUrl: imageUrl,
      resultImageUrl: resultUrl,
      prompt,
    }, '图片增强完成');
  } catch (error) {
    console.error('Image enhance error:', error);
    return createApiError('图片增强失败', 500);
  }
});
