// 数字人 Animate 角色动作迁移 API
// POST { imageUrl, videoUrl, mode? }              → 提交 Animate 任务
// GET  ?taskId=xxx                                 → 查状态

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { submitAnimateTask, getAnimateTaskStatus } from '@/lib/ai-services';
import { consume, refund, hasRefunded, InsufficientCreditsError } from '@/lib/credits';
import { calcDigitalHumanCost } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { imageUrl, videoUrl, mode = 'animate', resolution = '720P' } = await request.json();

    if (!imageUrl || !videoUrl) {
      return createApiError('缺少必填参数(imageUrl / videoUrl)', 400);
    }

    // URL 合法性粗校验
    if (!/^https?:\/\//.test(imageUrl) || !/^https?:\/\//.test(videoUrl)) {
      return createApiError('imageUrl / videoUrl 需为完整 HTTP(S) URL', 400);
    }

    const res = resolution === '480P' ? '480P' as const : '720P' as const;
    const creditCost = calcDigitalHumanCost(res);
    try {
      await consume(user.id, creditCost, 'ai_digital_human', `数字人 Animate ${res}`, { mode, resolution: res });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const result = await submitAnimateTask({
      imageUrl,
      videoUrl,
      mode: mode === 'replace' ? 'replace' : 'animate',
      resolution: resolution === '480P' ? '480P' : '720P',
    });

    if (!result.taskId) {
      await refund(user.id, creditCost, 'ai_digital_human', 'Animate 任务提交失败退点', { error: result.message }).catch(() => {});
      return createApiError(result.message || '任务提交失败', 500);
    }

    // 保存到历史
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
        content: `角色动作迁移 · ${res}`,
        content_type: 'video',
        metadata: {
          source: 'ai_creation',
          source_platform: 'ai_digital_human',
          generatedVideo: { taskId: result.taskId, status: 'pending', imageUrl },
          imageUrl,
          videoUrl,
          taskId: result.taskId,
          resolution: res,
          creditCost,
        },
      });
    }

    return createApiResponse({
      taskId: result.taskId,
      status: result.status,
    }, 'Animate 任务已提交,通常 1-3 分钟');
  } catch (e: any) {
    console.error('[Animate] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
});

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) return createApiError('缺少 taskId', 400);

  const result = await getAnimateTaskStatus(taskId);

  // 任务失败 → 退点
  if (result.status === 'failed' || result.status === 'error') {
    const already = await hasRefunded(user.id, taskId);
    if (!already) {
      const supabase = createAdminClient();
      const { data: msg } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('metadata->>taskId', taskId)
        .maybeSingle();
      const cost = (msg?.metadata as any)?.creditCost;
      if (cost && cost > 0) {
        await refund(user.id, cost, 'ai_digital_human', 'Animate 任务失败退点', {
          taskId, status: result.status, message: result.message,
        });
      }
    }
  }

  // 任务成功 → 回写 videoUrl
  if (result.status === 'succeeded' && result.videoUrl) {
    const supabase = createAdminClient();
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('metadata->>taskId', taskId)
      .maybeSingle();
    if (msg) {
      const meta = msg.metadata as any;
      await supabase.from('chat_messages')
        .update({
          metadata: {
            ...meta,
            generatedVideo: { ...meta.generatedVideo, videoUrl: result.videoUrl, status: 'succeeded' },
          },
        })
        .eq('user_id', user.id)
        .eq('metadata->>taskId', taskId);
    }
  }

  return createApiResponse(result, '状态已获取');
});
