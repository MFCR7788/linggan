// 用数字分身生成口播视频 API
// POST { avatarId, script, voiceId?, backgroundColor? }  → 提交生成
// GET  ?videoId=xxx                                       → 查状态

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateAvatarVideo, getAvatarVideoStatus } from '@/lib/ai-services';
import { consume, refund, hasRefunded, InsufficientCreditsError } from '@/lib/credits';
import { calcAvatarVideoCost } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { avatarId, script, voiceId, backgroundColor } = await request.json();

    if (!avatarId || !script) {
      return createApiError('缺少必填参数(avatarId / script)', 400);
    }

    if (script.length > 5000) {
      return createApiError('口播脚本不能超过 5000 字', 400);
    }

    const creditCost = calcAvatarVideoCost(script.length);
    try {
      await consume(user.id, creditCost, 'ai_avatar_video', `数字分身视频 ${script.length} 字`, { avatarId, chars: script.length });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const result = await generateAvatarVideo({
      avatarId,
      script: script.slice(0, 5000),
      voiceId,
      backgroundColor,
    });

    if (!result.ok) {
      await refund(user.id, creditCost, 'ai_avatar_video', '分身视频生成失败退点', { error: result.error }).catch(() => {});
      return createApiError(result.error || '生成失败', 500);
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
        content: script.substring(0, 200),
        content_type: 'video',
        metadata: {
          source: 'ai_creation',
          source_platform: 'ai_digital_human',
          generatedVideo: { videoId: result.videoId, status: 'pending', avatarId },
          avatarId,
          videoId: result.videoId,
          creditCost,
        },
      });
    }

    return createApiResponse({
      videoId: result.videoId,
    }, '分身视频已提交,通常 1-3 分钟');
  } catch (e: any) {
    console.error('[Avatar Video] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
});

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  if (!videoId) return createApiError('缺少 videoId', 400);

  const result = await getAvatarVideoStatus(videoId);

  // 任务失败 → 退点
  if (result.status === 'failed') {
    const already = await hasRefunded(user.id, videoId);
    if (!already) {
      const supabase = createAdminClient();
      const { data: msg } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('metadata->>videoId', videoId)
        .maybeSingle();
      const cost = (msg?.metadata as any)?.creditCost;
      if (cost && cost > 0) {
        await refund(user.id, cost, 'ai_avatar_video', '分身视频生成失败退点', {
          videoId, status: result.status, error: result.error,
        });
      }
    }
  }

  // 任务成功 → 回写 videoUrl
  if (result.status === 'completed' && result.videoUrl) {
    const supabase = createAdminClient();
    const { data: msg } = await supabase
      .from('chat_messages')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('metadata->>videoId', videoId)
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
        .eq('metadata->>videoId', videoId);
    }
  }

  return createApiResponse(result, '状态已获取');
});
