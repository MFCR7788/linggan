// 视频生成 API — 异步任务模式
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { submitVideoTask, getVideoTaskStatus, logAiUsage } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAiVideoCost } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

// 提交视频生成任务
export const POST = withAuth(async ({ request, user }) => {
  try {
    const {
      prompt,
      duration = 5,
      voiceStyle,
      bgmStyle,
      subtitleStyle,
      coverType,
      materialSource,
    } = await request.json();

    if (!prompt) {
      return createApiError('请输入提示词', 400);
    }

    const creditCost = calcAiVideoCost(duration || 5, 'standard');
    try {
      await consume(user.id, creditCost, 'ai_video', `AI 视频生成 ${duration || 5}s standard`, { duration, prompt: prompt.substring(0, 100) });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // 将所有选择参数融入 prompt，指导 AI 生成更匹配的结果
    let enrichedPrompt = prompt;

    // 追加配音风格指引
    const voiceHints: Record<string, string> = {
      professional: '配音风格：专业新闻播报感，语速适中，吐字清晰。',
      warm: '配音风格：温暖亲切，像朋友聊天一样自然。',
      energetic: '配音风格：充满激情与活力，语速较快，感染力强。',
      calm: '配音风格：沉稳低沉，有磁性，适合深夜或知识类内容。',
    };
    if (voiceStyle && voiceHints[voiceStyle]) {
      enrichedPrompt += `\n${voiceHints[voiceStyle]}`;
    }

    // 追加 BGM 风格指引（影响视频节奏感）
    const bgmHints: Record<string, string> = {
      tech: '背景音乐：科技感电子配乐，节奏明快。',
      chill: '背景音乐：轻松舒缓的轻音乐，氛围感强。',
      hype: '背景音乐：热血激昂，适合高潮段落。',
    };
    if (bgmStyle && bgmHints[bgmStyle]) {
      enrichedPrompt += `\n${bgmHints[bgmStyle]}`;
    }

    // 追加字幕风格指引
    if (subtitleStyle) {
      enrichedPrompt += `\n字幕样式：${subtitleStyle}，文字清晰醒目。`;
    }

    // 画面比例根据素材/封面偏好调整
    let ratio = '16:9';
    if (coverType === 'custom' || materialSource === 'local') {
      ratio = '9:16';
    }

    const result = await submitVideoTask(enrichedPrompt, duration || 5, ratio);
    if (!result.taskId) {
      console.error('[Video] submitVideoTask 失败:', result.message);
      await refund(user.id, creditCost, 'ai_video', '视频任务提交失败退点', { error: result.message }).catch(() => {});
      return createApiError(result.message || '视频生成服务暂不可用', 503);
    }

    await logAiUsage(user.id, 'video', 500);

    // 保存到"AI创作"作品集（不再每次创建新对话）
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
      .maybeSingle()
    ).data?.id;
    if (sessionId) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: prompt,
        content_type: 'text',
        metadata: { source: 'ai_creation', source_platform: 'ai_video', generatedVideo: { taskId: result.taskId, prompt: enrichedPrompt } },
      });
    }

    return createApiResponse(result, '视频生成任务已提交');
  } catch (error) {
    console.error('AI video generation error:', error);
    return createApiError('视频生成失败', 500);
  }
});

// 查询视频生成任务状态
export const GET = withAuth(async ({ request, user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return createApiError('缺少任务ID', 400);
    }

    const result = await getVideoTaskStatus(taskId);

    // 任务成功 → 回写 videoUrl 到 chat_messages,供历史作品展示
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

    return createApiResponse(result);
  } catch (error) {
    console.error('Video task status error:', error);
    return createApiError('查询失败', 500);
  }
});
