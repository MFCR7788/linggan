// 并行视频生成 API — 提交所有分段 + 批量查询状态
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { submitVideoGenerationTask, getVideoTaskStatus, getVideoTaskStatusUniversal, logAiUsage, type StoryboardScene } from '@/lib/ai-services';
import { QUALITY_TIERS, type VideoProvider } from '@/lib/video-models';
import { consume, refund, hasRefunded, InsufficientCreditsError } from '@/lib/credits';
import { calcAiVideoCost, CREDIT_COSTS } from '@/lib/credit-costs';
import { saveWorkHistory } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// ─── 批量提交 ────────────────────────────────────────────

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { storyboard, inspirations, qualityTier, firstFrameUrl, sceneFrames, lastFrameUrl, extraFrameUrls, mode, bgmStyle, subtitleStyle, subtitlePosition } = await request.json();
    const tier = (qualityTier === 'standard' || qualityTier === 'premium') ? qualityTier : 'fast';
    const videoMode: 'i2v' | 'multi' = mode === 'multi' ? 'multi' : 'i2v';
    const hasMultiFrame = videoMode === 'multi' && (lastFrameUrl || (Array.isArray(extraFrameUrls) && extraFrameUrls.length > 0));

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

    const qt = QUALITY_TIERS[tier] || QUALITY_TIERS['fast'];

    // ─── 预计算每段成本(按秒 × 档位系数) ─────────────────
    const segmentsMeta = (storyboard as StoryboardScene[]).map((scene) => {
      const duration = Math.min(Math.max(scene.duration, 3), qt.t2v.maxDuration || 10);
      return { duration, cost: calcAiVideoCost(duration, tier) };
    });
    const totalCost = segmentsMeta.reduce((sum, s) => sum + s.cost, 0);

    // ─── 扣点(预扣 total,提交失败时全退,段失败时按段退) ───
    try {
      await consume(user.id, totalCost, 'ai_video', `AI 视频 ${storyboard.length} 段 × ${tier}`, {
        tier, segmentCount: storyboard.length, totalDuration: segmentsMeta.reduce((s, x) => s + x.duration, 0),
        perSegment: segmentsMeta.map(s => s.cost),
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足:需要 ${totalCost} 灵力，当前 ${e.available} 灵力`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: totalCost, available: e.available },
          },
          { status: 402 }
        );
      }
      throw e;
    }

    // 并行提交所有分段
    const segments = await Promise.all(
      (storyboard as StoryboardScene[]).map(async (scene, i) => {
        const insp = inspirations?.[i];
        // 优先级：分镜首帧 > 素材图 > firstFrameUrl（首帧一致）
        let imageUrl: string | undefined;
        if (sceneFrames && sceneFrames[scene.index]) {
          imageUrl = sceneFrames[scene.index];
        } else if (i === 0 && firstFrameUrl) {
          imageUrl = firstFrameUrl;
        } else if (insp?.type === 'image' && insp?.media_urls?.[0]) {
          imageUrl = insp.media_urls[0];
        } else if (firstFrameUrl) {
          imageUrl = firstFrameUrl;
        }

        const duration = Math.min(Math.max(scene.duration, 3), qt.t2v.maxDuration || 10);

        let result;
        try {
          result = await submitVideoGenerationTask(
            tier,
            scene.visualPrompt,
            duration,
            imageUrl,
            hasMultiFrame ? lastFrameUrl : undefined,
            hasMultiFrame ? extraFrameUrls : undefined,
            hasMultiFrame ? 'multi' : 'i2v'
          );
        } catch (e: any) {
          // 单段提交失败 → 标 error,稍后状态查询时退点
          return {
            index: scene.index,
            taskId: '',
            model: '',
            provider: 'dashscope' as VideoProvider,
            status: 'error' as const,
            duration,
            materialType: imageUrl ? 'image' as const : 'text' as const,
            imageUrl,
            creditCost: calcAiVideoCost(duration, tier),
            error: String(e?.message),
          };
        }

        return {
          index: scene.index,
          taskId: result.taskId,
          model: result.model,
          provider: result.provider,
          status: result.status === 'queued' ? 'queued' as const : 'error' as const,
          duration,
          materialType: imageUrl ? 'image' as const : 'text' as const,
          imageUrl,
          creditCost: calcAiVideoCost(duration, tier),
        };
      })
    );

    // 记录用量
    await logAiUsage(user.id, 'video', segments.length * 500);

    // 保存生成记录
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await saveWorkHistory(user.id, JSON.stringify({ batchId, segmentCount: segments.length, storyboard }), {
      source_platform: 'ai_video',
      batchId,
      tier,
      totalCost,
      segments: segments.map((s) => ({ taskId: s.taskId, model: s.model, creditCost: s.creditCost })),
    });

    return createApiResponse({ batchId, segments, creditsUsed: totalCost }, '视频任务已提交');
  } catch (error) {
    console.error('Video generate error:', error);
    return createApiError('视频生成失败', 500);
  }
});

// ─── 批量查询 ────────────────────────────────────────────

export const GET = withAuth(async ({ request, user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    // 如果没有 batchId，走单任务查询（兼容旧逻辑）
    const taskId = searchParams.get('taskId');
    const singleProvider = searchParams.get('provider');
    if (taskId && !searchParams.get('taskIds')) {
      const result = singleProvider
        ? await getVideoTaskStatusUniversal(taskId, singleProvider as VideoProvider)
        : await getVideoTaskStatus(taskId);
      return createApiResponse(result);
    }

    // 获取 taskIds（支持 ?taskIds=X,Y,Z 或向后兼容 ?taskId=X）
    const taskIdsParam = searchParams.get('taskIds') || searchParams.get('taskId');
    if (!taskIdsParam) {
      return createApiError('缺少 taskIds 或 taskId', 400);
    }

    const taskIds = taskIdsParam.split(',');
    // 可选的 providers 参数，与 taskIds 一一对应
    const providersParam = searchParams.get('providers');
    const providers = providersParam ? providersParam.split(',') : [];

    const resultsArray = await Promise.all(
      taskIds.map(async (id, idx) => {
        try {
          const provider = (providers[idx] || 'dashscope') as VideoProvider;
          const result = await getVideoTaskStatusUniversal(id, provider);
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

    // ─── 失败段自动退点(异步) ───────────────────────
    // 检测到 failed/error 段时,按段 creditCost 退(从 chat_messages.metadata.segments[] 查)
    // 用 hasRefunded 防重复退
    const supabase = createAdminClient();
    // 一次性查出当前用户最近的视频批次记录(含 segments 数组),避免每段都查一次 DB
    const { data: recentBatches } = await supabase
      .from('chat_messages')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('type', 'ai')
      .order('created_at', { ascending: false })
      .limit(20);
    // 构建 { taskId → creditCost } 索引
    const taskCostMap: Record<string, number> = {};
    if (recentBatches) {
      for (const row of recentBatches) {
        const meta = row.metadata as any;
        if (meta?.segments && Array.isArray(meta.segments)) {
          for (const seg of meta.segments) {
            if (seg.taskId && typeof seg.creditCost === 'number') {
              taskCostMap[seg.taskId] = seg.creditCost;
            }
          }
        }
      }
    }
    for (const r of resultsArray) {
      if (r.status === 'failed' || r.status === 'error') {
        if (!r.taskId) continue;  // 提交时就失败的,无需退点(已在外层 try/catch 退过)
        const already = await hasRefunded(user.id, r.taskId);
        if (already) continue;
        const segCost = taskCostMap[r.taskId] || 0;
        if (segCost > 0) {
          await refund(user.id, segCost, 'ai_video', '视频段失败退点', {
            taskId: r.taskId, status: r.status, message: r.message,
          });
        }
      }
    }

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
});
