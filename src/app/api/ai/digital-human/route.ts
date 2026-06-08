// 数字人 API — Audio2Video（wan2.2-s2v）
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { submitDigitalHumanTask, getDigitalHumanTaskStatus, logAiUsage } from '@/lib/ai-services';
import { consume, refund, hasRefunded, InsufficientCreditsError } from '@/lib/credits';
import { calcDigitalHumanCost, CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { imageUrl, audioUrl, resolution, audioDuration } = await request.json();

    if (!imageUrl || !audioUrl) {
      return createApiError('请提供角色图片和音频', 400);
    }

    if (!imageUrl.startsWith('http') || !audioUrl.startsWith('http')) {
      return createApiError('图片和音频必须是公网可访问的URL', 400);
    }

    // 音频时长校验: wan2.2-s2v 硬限制 ≤ 20 秒, 超过会返 "input audio is longer than 20s"
    // 接受前端测的 audioDuration (HTMLAudioElement.duration, 秒)
    const MAX_AUDIO_SECONDS = 20;
    if (typeof audioDuration === 'number' && audioDuration > MAX_AUDIO_SECONDS) {
      return createApiError(
        `音频时长 ${audioDuration.toFixed(1)} 秒,超过 wan2.2-s2v 模型的 ${MAX_AUDIO_SECONDS} 秒限制,请精简脚本(建议 300 字以内)`,
        400
      );
    }

    // ─── 扣点(按分辨率预扣,异步任务失败时在 GET 状态查询时退) ──────
    const finalRes = (resolution === '480P' || resolution === '720P') ? resolution : '720P';
    const creditCost = calcDigitalHumanCost(finalRes);
    try {
      await consume(user.id, creditCost, 'ai_digital_human', `数字人 ${finalRes}`, {
        resolution: finalRes,
        audioDuration,
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

    let result;
    try {
      result = await submitDigitalHumanTask({ imageUrl, audioUrl, resolution: finalRes });
    } catch (e: any) {
      // 提交阶段失败,直接退点
      await refund(user.id, creditCost, 'ai_digital_human', '数字人提交失败退点', {
        resolution: finalRes, error: String(e?.message),
      });
      return createApiError(`提交失败: ${e?.message || '未知错误'}`, 500);
    }

    if (!result.taskId) {
      // 没拿到 taskId,退点
      await refund(user.id, creditCost, 'ai_digital_human', '数字人任务创建失败退点', {
        resolution: finalRes, upstreamMsg: result.message,
      });
      return createApiError(result.message || '提交失败', 500);
    }

    // 记录用量
    await logAiUsage(user.id, 'video', resolution === '480P' ? 300 : 500);

    // 保存到作品记录
    const supabase = createAdminClient();
    const batchId = `dh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { data: sessionData } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('title', 'AI创作')
      .maybeSingle();

    const sessionId = sessionData?.id || (await supabase
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
        content: `数字人视频生成 · ${finalRes}`,
        content_type: 'video',
        metadata: {
          source: 'digital_human',
          batchId,
          imageUrl,
          audioUrl,
          taskId: result.taskId,
          resolution: finalRes,
          creditCost,
        },
      });
    }

    return createApiResponse({
      taskId: result.taskId,
      batchId,
      creditsUsed: creditCost,
    }, '数字人任务已提交');
  } catch (error) {
    console.error('Digital human submit error:', error);
    return createApiError('提交失败', 500);
  }
});

export const GET = withAuth(async ({ request, user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return createApiError('缺少 taskId', 400);
    }

    const result = await getDigitalHumanTaskStatus(taskId);

    // 异步任务失败 → 自动退点(防止用户白花)
    // 用 hasRefunded 查 taskId 是否已退过,避免重复退
    if (result.status === 'failed' || result.status === 'error') {
      const already = await hasRefunded(user.id, taskId);
      if (!already) {
        // 找原始扣点:从 chat_messages 里查这条任务的 creditCost
        const supabase = createAdminClient();
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('metadata')
          .eq('user_id', user.id)
          .eq('metadata->>taskId', taskId)
          .maybeSingle();
        const cost = (msg?.metadata as any)?.creditCost;
        if (cost && cost > 0) {
          await refund(user.id, cost, 'ai_digital_human', '数字人任务失败退点', {
            taskId, status: result.status, message: result.message,
          });
        }
      }
    }

    return createApiResponse(result);
  } catch (error) {
    console.error('Digital human query error:', error);
    return createApiError('查询失败', 500);
  }
});
