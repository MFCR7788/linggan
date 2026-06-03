// 并行视频生成 API — 提交所有分段 + 批量查询状态
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { submitVideoGenerationTask, getVideoTaskStatus, getVideoTaskStatusUniversal, logAiUsage, type StoryboardScene } from '@/lib/ai-services';
import { QUALITY_TIERS, type VideoProvider } from '@/lib/video-models';
import { consume, refund, hasRefunded, InsufficientCreditsError } from '@/lib/credits';
import { calcAiVideoCost, CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

// ─── 批量提交 ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { storyboard, inspirations, qualityTier, firstFrameUrl, lastFrameUrl, extraFrameUrls, mode, bgmStyle, subtitleStyle, subtitlePosition } = await request.json();
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
      const duration = Math.min(Math.max(scene.duration, 3), 10);
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
            error: `余额不足:需要 ${totalCost} credits,当前 ${e.available} credits`,
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
        // 优先：i==0 用 firstFrameUrl（首帧一致），i>0 用对应素材图，否则用 firstFrameUrl 作为延续
        let imageUrl: string | undefined;
        if (i === 0 && firstFrameUrl) {
          imageUrl = firstFrameUrl;
        } else if (insp?.type === 'image' && insp?.media_urls?.[0]) {
          imageUrl = insp.media_urls[0];
        } else if (firstFrameUrl) {
          imageUrl = firstFrameUrl;
        }

        const duration = Math.min(Math.max(scene.duration, 3), 10);

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
          tier,
          totalCost,
          segments: segments.map((s) => ({ taskId: s.taskId, model: s.model, creditCost: s.creditCost })),
        },
      });
    }

    return createApiResponse({ batchId, segments, creditsUsed: totalCost }, '视频任务已提交');
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
    // 检测到 failed/error 段时,按段 creditCost 退(从 chat_messages.metadata 查)
    // 用 hasRefunded 防重复退
    const supabase = createAdminClient();
    for (const r of resultsArray) {
      if (r.status === 'failed' || r.status === 'error') {
        if (!r.taskId) continue;  // 提交时就失败的,无需退点(已在外层 try/catch 退过)
        const already = await hasRefunded(user.id, r.taskId);
        if (already) continue;
        // 查原始扣点金额
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('metadata')
          .eq('user_id', user.id)
          .eq('metadata->>taskId', r.taskId)
          .maybeSingle();
        const meta = msg?.metadata as any;
        // 视频段存的是 segments[].taskId,查 segments 数组
        let segCost = 0;
        if (meta?.segments && Array.isArray(meta.segments)) {
          const seg = meta.segments.find((s: any) => s.taskId === r.taskId);
          segCost = seg?.creditCost || 0;
        }
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
}
