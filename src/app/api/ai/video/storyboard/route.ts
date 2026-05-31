// AI 分镜脚本生成 API
// @deprecated — 已替换为 /api/ai/video/storyboard-v2（一步生成分镜+字幕）
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { generateStoryboard, calcSegmentDurations } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { script, duration } = await request.json();

    if (!script) {
      return createApiError('请提供脚本内容', 400);
    }

    const totalDuration = duration || 10;
    if (![10, 15, 30, 60].includes(totalDuration)) {
      return createApiError('时长仅支持 10s/15s/30s/60s', 400);
    }

    const durations = calcSegmentDurations(totalDuration);
    const storyboard = await generateStoryboard(script, totalDuration);

    return createApiResponse({
      storyboard,
      segmentCount: storyboard.length,
      durations,
      totalDuration,
    }, '分镜已生成');
  } catch (error) {
    console.error('Storyboard generation error:', error);
    return createApiError('分镜生成失败', 500);
  }
}
