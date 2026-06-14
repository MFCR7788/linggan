// 视频混剪提交 API
// POST /api/ai/video-mix/submit

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import type { MixProject, MixSubmitResult } from '@/lib/video-mixer/types';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  let body: {
    project: MixProject;
    title?: string;
  };

  try {
    body = await request.json();
  } catch {
    return createApiError('请求格式无效', 400);
  }

  const { project } = body;
  if (!project || !project.segments || project.segments.length === 0) {
    return createApiError('缺少混剪项目配置或素材片段', 400);
  }

  if (project.segments.length > 50) {
    return createApiError('单次混剪最多支持 50 个片段', 400);
  }

  // 计算费用
  const totalDuration = project.segments.reduce(
    (sum, s) => sum + (s.trimEnd - s.trimStart),
    0
  );
  const { consume } = await import('@/lib/credits');
  const { calcVideoMixCost } = await import('@/lib/credit-costs');
  const cost = calcVideoMixCost(totalDuration);

  try {
    await consume(
      user.id,
      cost,
      'video_mix',
      `视频混剪 ${project.segments.length}段 ${Math.ceil(totalDuration)}秒`
    );
  } catch (e: unknown) {
    const creditError = e as { code?: string; available?: number };
    if (creditError.code === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json(
        {
          success: false,
          error: `余额不足，需要 ${cost} credits，当前可用 ${creditError.available}`,
          code: 'INSUFFICIENT_CREDITS',
          data: { required: cost, available: creditError.available },
        },
        { status: 402 }
      );
    }
    throw e;
  }

  // 将混剪任务提交到任务队列
  const { enqueueBatch } = await import('@/lib/jobs/queue');

  try {
    const result = await enqueueBatch({
      userId: user.id,
      taskType: 'video_mix',
      items: [
        {
          prompt: body.title || '混剪作品',
          params: { project, userId: user.id },
        },
      ],
      priority: 5,
      estimatedSeconds: Math.max(30, Math.ceil(totalDuration * 2)),
    });

    const mixResult: MixSubmitResult = {
      taskId: result.taskIds[0],
      batchId: result.batchId,
      status: 'queued',
    };

    return createApiResponse(mixResult, `混剪任务已提交 (${cost} credits)`);
  } catch (e) {
    // 队列不可用时直接同步执行（降级）
    console.warn('[video-mix] 任务队列不可用，尝试同步执行');
    try {
      const { mixVideos } = await import('@/lib/video-mixer/engine');
      const { readFileSync } = await import('fs');

      const outputPath = await mixVideos(project);
      const supabase = createAdminClient();
      const fileBuffer = readFileSync(outputPath);
      const fileName = `mix-${Date.now()}.mp4`;

      const { error: uploadError } = await supabase.storage
        .from('lingji-media')
        .upload(`videos/${user.id}/${fileName}`, fileBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (uploadError) throw new Error(`上传失败: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('lingji-media')
        .getPublicUrl(`videos/${user.id}/${fileName}`);

      return createApiResponse({
        taskId: `sync-${Date.now()}`,
        status: 'completed' as const,
        outputUrl: urlData.publicUrl,
      }, '混剪完成');
    } catch (syncError) {
      console.error('[video-mix] 同步执行失败:', syncError);
      return createApiError('混剪任务提交失败', 500);
    }
  }
});
