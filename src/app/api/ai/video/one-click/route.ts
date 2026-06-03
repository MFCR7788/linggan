// 一键成片 API — 自动分镜 + 提交 + 合并
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateStoryboardV2, submitVideoGenerationTask, logAiUsage, type StoryboardScene } from '@/lib/ai-services';
import { QUALITY_TIERS } from '@/lib/video-models';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAiVideoCost } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

/** 自动计算推荐时长 */
function autoDuration(inspirationCount: number): number {
  if (inspirationCount >= 5) return 60;
  if (inspirationCount >= 3) return 30;
  if (inspirationCount >= 2) return 15;
  return 10;
}

export const POST = withAuth(async ({ request, user }) => {
  try {
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

    const tier = (qualityTier === 'standard' || qualityTier === 'premium') ? qualityTier : 'fast';
    const duration = autoDuration(inspirations.length);

    // 1. 生成分镜
    let storyboard;
    try {
      storyboard = await generateStoryboardV2({
        inspirations,
        stylePreset,
        duration,
        topic: topic || undefined,
        language,
      });
    } catch (e: any) {
      return createApiError(`分镜生成失败: ${e?.message || '未知错误'}`, 500);
    }

    // 2. 预计算成本
    const segMeta = storyboard.map((scene) => {
      const d = Math.min(Math.max(scene.duration, 3), 10);
      return { duration: d, cost: calcAiVideoCost(d, tier) };
    });
    const totalCost = segMeta.reduce((sum, s) => sum + s.cost, 0);

    // 3. 预扣 total
    try {
      await consume(user.id, totalCost, 'ai_video', `一键成片 ${storyboard.length} 段 × ${tier}`, {
        tier, segmentCount: storyboard.length, oneClick: true,
        perSegment: segMeta.map(s => s.cost),
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

    // 4. 并行提交所有分段
    const qt = QUALITY_TIERS[tier] || QUALITY_TIERS['fast'];
    const segments = await Promise.all(
      storyboard.map(async (scene, i) => {
        const insp = inspirations[i];
        const imageUrl = (insp?.type === 'image' && insp?.media_urls?.[0])
          ? insp.media_urls[0]
          : undefined;

        const segDuration = Math.min(Math.max(scene.duration, 3), 10);
        let result;
        try {
          result = await submitVideoGenerationTask(
            tier,
            scene.visualPrompt,
            segDuration,
            imageUrl
          );
        } catch (e: any) {
          return {
            index: scene.index,
            taskId: '',
            model: '',
            provider: 'dashscope' as const,
            status: 'error' as const,
            duration: segDuration,
            materialType: imageUrl ? 'image' as const : 'text' as const,
            imageUrl,
            creditCost: calcAiVideoCost(segDuration, tier),
            error: String(e?.message),
          };
        }

        return {
          index: scene.index,
          taskId: result.taskId,
          model: result.model,
          provider: result.provider,
          status: result.status === 'queued' ? 'queued' as const : 'error' as const,
          duration: segDuration,
          materialType: imageUrl ? 'image' as const : 'text' as const,
          imageUrl,
          creditCost: calcAiVideoCost(segDuration, tier),
        };
      })
    );

    // 5. 记录用量
    await logAiUsage(user.id, 'video', segments.length * 500);

    // 6. 保存作品(带 creditCost 供失败退点用)
    const batchId = `oneclick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        content: `一键成片 · ${storyboard.length} 段`,
        content_type: 'text',
        metadata: {
          source: 'ai_creation',
          batchId,
          tier,
          totalCost,
          oneClick: true,
          segments: segments.map((s) => ({ taskId: s.taskId, model: s.model, creditCost: s.creditCost })),
        },
      });
    }

    const taskIds = segments.filter((s) => s.taskId).map((s) => s.taskId).join(',');
    const providers = segments.filter((s) => s.taskId).map((s) => s.provider).join(',');

    return createApiResponse({
      storyboard,
      segments,
      taskIds,
      providers,
      duration,
      batchId,
      creditsUsed: totalCost,
    }, '一键成片任务已提交');
  } catch (error) {
    console.error('One-click video error:', error);
    return createApiError('一键成片失败', 500);
  }
});
