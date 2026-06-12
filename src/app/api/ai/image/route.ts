import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateImage, logAiUsage } from '@/lib/ai-services';
import { findImagePreset, findImagePalette } from '@/lib/preset-templates';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const {
      prompt,
      ratio,
      n,
      presetId,
      style,
      paletteId,
      seed,
      negativePrompt,
    } = await request.json();

    if (!prompt) {
      return createApiError('Prompt is required', 400);
    }

    // 解析 preset/style/palette
    const preset = presetId ? findImagePreset(presetId) : null;
    const palette = paletteId ? findImagePalette(paletteId) : null;

    const finalRatio = ratio || preset?.ratio || '1:1';
    const finalStyle = style || preset?.style;
    const finalPaletteName = palette?.name;

    // 把 preset 的 promptHint 拼到 prompt 前面（让 AI 模型感知预设）
    let finalPrompt = prompt;
    if (preset) {
      finalPrompt = `[${preset.label} | ${preset.ratio} | ${preset.style} | 模板: ${preset.promptHint}] ${finalPrompt}`;
    }
    if (finalStyle && finalStyle !== preset?.style) {
      finalPrompt = `[风格: ${finalStyle}] ${finalPrompt}`;
    }
    if (finalPaletteName) {
      finalPrompt += ` | 主色调: ${finalPaletteName}`;
    }
    // 负面提示: 拼到 prompt 末尾(逗号分隔),让"不想要的内容"真的生效
    // 火山方舟 Seedance 模型没有 native negative_prompt 字段, 用 prompt 后缀是稳妥做法
    if (negativePrompt && typeof negativePrompt === 'string' && negativePrompt.trim()) {
      finalPrompt += `, 避免: ${negativePrompt.trim()}`;
    }

    const count = Math.min(n || 1, 4);

    // ─── 扣点(预扣,按张数 × 单价) ──────────────────
    const creditCost = count * CREDIT_COSTS.ai_image.perImage;
    try {
      await consume(user.id, creditCost, 'ai_image', `AI 图片 ${count} 张`, {
        count,
        presetId: presetId || null,
        ratio: finalRatio,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: creditCost, available: e.available },
          },
          { status: 402 }
        );
      }
      throw e;
    }

    // 解析 seed：支持正整数，未传或无效则不传（保持随机）
    let finalSeed: number | undefined;
    if (seed !== undefined && seed !== null && seed !== '') {
      const parsed = Number(seed);
      if (Number.isFinite(parsed) && parsed >= 0) {
        finalSeed = Math.floor(parsed);
      }
    }

    let result;
    try {
      result = await generateImage(finalPrompt, { ratio: finalRatio, n: count, seed: finalSeed });
    } catch (e: any) {
      // 失败退点
      await refund(user.id, creditCost, 'ai_image', 'AI 图片生成失败退点', { count, error: String(e?.message) });
      console.error('[AI image] generateImage failed:', e);
      return createApiError(`AI 图片生成失败: ${e?.message || '未知错误'}`, 500);
    }

    // 记录AI使用
    await logAiUsage(user.id, 'image', 100 * count);

    // 保存到"AI创作"作品集
    const supabase = createAdminClient();
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('title', 'AI创作')
      .maybeSingle();
    const sessionId = session?.id || (await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: 'AI创作' })
      .select('id')
      .single()
    ).data?.id;
    if (sessionId) {
      const firstResult = Array.isArray(result) ? result[0] : result;
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: prompt,
        content_type: 'text',
        metadata: {
          source: 'ai_creation',
          source_platform: 'ai_image',
          generatedImage: { imageUrl: firstResult.imageUrl, prompt: firstResult.prompt, size: firstResult.size },
          batchImages: Array.isArray(result) ? result.map((r) => ({ imageUrl: r.imageUrl, size: r.size })) : undefined,
          presetId: presetId || null,
          style: finalStyle || null,
          paletteId: paletteId || null,
          seed: finalSeed ?? null,
        },
      });
    }

    return createApiResponse(result, 'Image generated');
  } catch (error) {
    console.error('AI image generation error:', error);
    return createApiError('Failed to generate image', 500);
  }
});
