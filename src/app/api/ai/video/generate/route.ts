// 并行视频生成 API — 提交所有分段 + 批量查询状态
import { NextRequest } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { submitVideoTask, submitI2VTask, getVideoTaskStatus, logAiUsage, type StoryboardScene } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

// ─── 批量提交 ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { storyboard, inspirations } = await request.json();

    if (!storyboard || !Array.isArray(storyboard) || storyboard.length === 0) {
      return createApiError('请提供分镜脚本', 400);
    }

    // 映射素材：按 type 区分图片素材
    const imageMap = new Map<string, string>();
    if (inspirations && Array.isArray(inspirations)) {
      for (const insp of inspirations) {
        if (insp.type === 'image' && insp.media_urls?.length > 0) {
          imageMap.set(insp.id, insp.media_urls[0]);
        }
      }
    }

    // 并行提交所有分段
    const segments = await Promise.all(
      (storyboard as StoryboardScene[]).map(async (scene, i) => {
        // 找对应的图片素材（简单分配：第 i 段用第 i 个图片素材）
        const insp = inspirations?.[i];
        const imageUrl = (insp?.type === 'image' && insp?.media_urls?.[0])
          ? insp.media_urls[0]
          : undefined;

        const duration = Math.min(Math.max(scene.duration, 3), 10);

        if (imageUrl) {
          const result = await submitI2VTask(imageUrl, scene.visualPrompt, duration);
          return {
            index: scene.index,
            taskId: result.taskId,
            model: 'happyhorse-1.0-i2v' as const,
            status: result.status === 'queued' ? 'queued' as const : 'error' as const,
            duration,
            materialType: 'image' as const,
            imageUrl,
          };
        } else {
          const result = await submitVideoTask(scene.visualPrompt, duration);
          return {
            index: scene.index,
            taskId: result.taskId,
            model: 'happyhorse-1.0-t2v' as const,
            status: result.status === 'queued' ? 'queued' as const : 'error' as const,
            duration,
            materialType: 'text' as const,
          };
        }
      })
    );

    // 记录用量
    await logAiUsage(user.id, 'video', segments.length * 500);

    // 保存生成记录
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: JSON.stringify({ batchId, segmentCount: segments.length, storyboard }),
        content_type: 'text',
        metadata: {
          source: 'ai_creation',
          batchId,
          generatedVideo: { segments: segments.map((s) => ({ taskId: s.taskId, model: s.model })) },
        },
      });
    }

    return createApiResponse({ batchId, segments }, '视频任务已提交');
  } catch (error) {
    console.error('Video generate error:', error);
    return createApiError('视频生成失败', 500);
  }
}

// ─── 批量查询 ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    // 如果没有 batchId，走单任务查询（兼容旧逻辑）
    const taskId = searchParams.get('taskId');
    if (taskId && !searchParams.get('taskIds')) {
      const result = await getVideoTaskStatus(taskId);
      return createApiResponse(result);
    }

    // 获取 taskIds（支持 ?taskIds=X,Y,Z 或向后兼容 ?taskId=X）
    const taskIdsParam = searchParams.get('taskIds') || searchParams.get('taskId');
    if (!taskIdsParam) {
      return createApiError('缺少 taskIds 或 taskId', 400);
    }

    const taskIds = taskIdsParam.split(',');

    const resultsArray = await Promise.all(
      taskIds.map(async (id) => {
        try {
          const result = await getVideoTaskStatus(id);
          return { taskId: id, ...result };
        } catch {
          return { taskId: id, status: 'error', message: '查询失败' };
        }
      })
    );

    // 构建 { taskId → result } 映射，方便前端按 taskId 精确匹配
    const results: Record<string, { status: string; videoUrl?: string; message?: string }> = {};
    resultsArray.forEach((r) => { results[r.taskId] = r; });

    const allDone = resultsArray.every((r) => r.status === 'succeeded' || r.status === 'failed' || r.status === 'error');
    const succeededCount = resultsArray.filter((r) => r.status === 'succeeded').length;
    const failedCount = resultsArray.filter((r) => r.status === 'failed').length;
    const videoUrls = resultsArray
      .filter((r) => r.status === 'succeeded' && r.videoUrl)
      .map((r) => r.videoUrl as string);

    return createApiResponse({
      results,
      progress: {
        total: resultsArray.length,
        succeeded: succeededCount,
        failed: failedCount,
        pending: resultsArray.length - succeededCount - failedCount,
        allDone,
      },
      videoUrls,
    });
  } catch (error) {
    console.error('Video status error:', error);
    return createApiError('查询失败', 500);
  }
}
