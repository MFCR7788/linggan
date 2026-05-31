// 视频生成 API — 异步任务模式
import { NextRequest } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { submitVideoTask, getVideoTaskStatus, logAiUsage } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

// 提交视频生成任务
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

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
      .single()
    ).data?.id;
    if (sessionId) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        user_id: user.id,
        type: 'ai',
        content: prompt,
        content_type: 'text',
        metadata: { source: 'ai_creation', generatedVideo: { taskId: result.taskId, prompt: enrichedPrompt } },
      });
    }

    return createApiResponse(result, '视频生成任务已提交');
  } catch (error) {
    console.error('AI video generation error:', error);
    return createApiError('视频生成失败', 500);
  }
}

// 查询视频生成任务状态
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return createApiError('缺少任务ID', 400);
    }

    const result = await getVideoTaskStatus(taskId);
    return createApiResponse(result);
  } catch (error) {
    console.error('Video task status error:', error);
    return createApiError('查询失败', 500);
  }
}
