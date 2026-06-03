// 一键成片 API — 自动分镜 + 提交 + 合并
import { NextRequest } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { generateStoryboardV2, submitVideoGenerationTask, logAiUsage, type StoryboardScene } from '@/lib/ai-services';
import { QUALITY_TIERS } from '@/lib/video-models';

export const dynamic = 'force-dynamic';

/** 自动计算推荐时长 */
function autoDuration(inspirationCount: number): number {
  if (inspirationCount >= 5) return 60;
  if (inspirationCount >= 3) return 30;
  if (inspirationCount >= 2) return 15;
  return 10;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const {
      inspirations,
      topic,
      stylePreset = 'douyin_hot',
      qualityTier = 'fast',
      language = 'zh',
    } = await request.json();

    if (!inspirations || !Array.isArray(inspirations) || inspirations.length === 0) {
      return createApiError('请选择至少一个素材', 400);
    }

    const duration = autoDuration(inspirations.length);

    // 1. 生成分镜
    const storyboard = await generateStoryboardV2({
      inspirations,
      stylePreset,
      duration,
      topic: topic || undefined,
      language,
    });

    // 2. 并行提交所有分段
    const qt = QUALITY_TIERS[qualityTier] || QUALITY_TIERS['fast'];
    const segments = await Promise.all(
      storyboard.map(async (scene, i) => {
        const insp = inspirations[i];
        const imageUrl = (insp?.type === 'image' && insp?.media_urls?.[0])
          ? insp.media_urls[0]
          : undefined;

        const segDuration = Math.min(Math.max(scene.duration, 3), 10);
        const result = await submitVideoGenerationTask(
          qualityTier,
          scene.visualPrompt,
          segDuration,
          imageUrl
        );

        return {
          index: scene.index,
          taskId: result.taskId,
          model: result.model,
          provider: result.provider,
          status: result.status === 'queued' ? 'queued' as const : 'error' as const,
          duration: segDuration,
          materialType: imageUrl ? 'image' as const : 'text' as const,
          imageUrl,
        };
      })
    );

    // 3. 记录用量
    await logAiUsage(user.id, 'video', segments.length * 500);

    const taskIds = segments.filter((s) => s.taskId).map((s) => s.taskId).join(',');
    const providers = segments.filter((s) => s.taskId).map((s) => s.provider).join(',');

    return createApiResponse({
      storyboard,
      segments,
      taskIds,
      providers,
      duration,
    }, '一键成片任务已提交');
  } catch (error) {
    console.error('One-click video error:', error);
    return createApiError('一键成片失败', 500);
  }
}
