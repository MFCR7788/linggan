// AI 分镜生成 v2 — 一步到位：素材 + 风格 + 时长 + 主题 → 分镜
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateStoryboardV2, calcSegmentDurations } from '@/lib/ai-services';
import { STYLE_PRESETS } from '@/lib/style-constants';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { inspirations, stylePreset, duration, topic, language, firstFrameUrl } = await request.json();

    if (!inspirations || !Array.isArray(inspirations) || inspirations.length === 0) {
      return createApiError('请选择至少一个素材', 400);
    }

    if (!stylePreset || !STYLE_PRESETS[stylePreset]) {
      return createApiError('请选择有效的视频风格', 400);
    }

    const totalDuration = duration || 10;
    if (![10, 15, 30, 60].includes(totalDuration)) {
      return createApiError('时长仅支持 10s/15s/30s/60s', 400);
    }

    const creditCost = CREDIT_COSTS.ai_video_post.storyboard;
    try {
      await consume(user.id, creditCost, 'ai_storyboard', 'AI 分镜生成 v2', { stylePreset, duration: totalDuration, topic: topic || '' });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const durations = calcSegmentDurations(totalDuration);
    const storyboard = await generateStoryboardV2({
      inspirations,
      stylePreset,
      duration: totalDuration,
      topic: topic?.trim() || undefined,
      language: language || 'zh',
      firstFrameUrl: firstFrameUrl || undefined,
    });

    const preset = STYLE_PRESETS[stylePreset];

    return createApiResponse({
      storyboard,
      segmentCount: storyboard.length,
      durations,
      totalDuration,
      styleDefaults: {
        bgm: preset.bgm,
        subtitle: preset.subtitle,
        subtitlePos: preset.subtitlePos,
      },
    }, '分镜已生成');
  } catch (error) {
    console.error('StoryboardV2 generation error:', error);
    return createApiError('分镜生成失败', 500);
  }
});
