// 图片增强 API — 超分辨率 / 背景替换 / 风格迁移
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { callDoubaoVision, generateImage, logAiUsage } from '@/lib/ai-services';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

const STYLE_TRANSFER_PRESETS: Record<string, { label: string; prompt: string }> = {
  watercolor: { label: '水彩手绘', prompt: 'watercolor painting style, soft brushstrokes, artistic, hand-painted look' },
  illustration: { label: '插画风格', prompt: 'digital illustration style, flat colors, clean lines, modern illustration' },
  cyberpunk: { label: '赛博朋克', prompt: 'cyberpunk style, neon lights, futuristic city, high contrast, dark atmosphere' },
  '3d_render': { label: '3D渲染', prompt: '3D rendered style, octane render, realistic materials, cinematic lighting' },
  sketch: { label: '素描风格', prompt: 'pencil sketch style, monochrome, detailed linework, artistic drawing' },
  vintage: { label: '复古胶片', prompt: 'vintage film photography style, warm tones, film grain, nostalgic look' },
};

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
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 1. 先用 Vision 分析原图
    const visionResult = await callDoubaoVision(
      imageUrl,
      '请用中文详细描述这张图片的内容、主体、背景、光线、色彩和构图，控制在100字以内。'
    );

    let resultPrompt = '';
    let resultImageUrl = '';
    let enhanceLabel = '';

    switch (mode) {
      case 'upscale': {
        // 超分辨率：基于原图描述重新生成高清版本
        enhanceLabel = '超分辨率增强';
        resultPrompt = `${visionResult.description}. High resolution, ultra detailed, 4K, sharp focus, professional photography, masterpiece quality.`;
        const upscaleResult = await generateImage(resultPrompt, { ratio: options?.ratio || '1:1' });
        resultImageUrl = Array.isArray(upscaleResult) ? upscaleResult[0].imageUrl : upscaleResult.imageUrl;
        break;
      }

      case 'bg_replace': {
        // 背景替换：用 AI 描述原图前景，结合用户指定的新背景
        const newBg = options?.newBackground || 'clean white studio background';
        enhanceLabel = '背景替换';
        resultPrompt = `${visionResult.description}. Replace the background with: ${newBg}. Keep the main subject exactly the same, seamless composition, professional lighting matching.`;
        const bgResult = await generateImage(resultPrompt, { ratio: options?.ratio || '1:1' });
        resultImageUrl = Array.isArray(bgResult) ? bgResult[0].imageUrl : bgResult.imageUrl;
        break;
      }

      case 'style_transfer': {
        // 风格迁移：应用预设风格
        const styleKey = options?.style || 'watercolor';
        const stylePreset = STYLE_TRANSFER_PRESETS[styleKey] || STYLE_TRANSFER_PRESETS['watercolor'];
        enhanceLabel = `风格迁移 · ${stylePreset.label}`;
        resultPrompt = `${visionResult.description}. Transform this into ${stylePreset.prompt}, preserve the original composition and main elements.`;
        const styleResult = await generateImage(resultPrompt, { ratio: options?.ratio || '1:1' });
        resultImageUrl = Array.isArray(styleResult) ? styleResult[0].imageUrl : styleResult.imageUrl;
        break;
      }

      default:
        return createApiError('未知的增强模式', 400);
    }

    await logAiUsage(user.id, 'image', 150);

    return createApiResponse({
      mode,
      enhanceLabel,
      originalDescription: visionResult.description,
      originalImageUrl: imageUrl,
      resultImageUrl,
      prompt: resultPrompt,
    }, '图片增强完成');
  } catch (error) {
    console.error('Image enhance error:', error);
    return createApiError('图片增强失败', 500);
  }
});
