// 数字人 API — Audio2Video（wan2.2-s2v）
import { NextRequest } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { submitDigitalHumanTask, getDigitalHumanTaskStatus, logAiUsage } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { imageUrl, audioUrl, resolution } = await request.json();

    if (!imageUrl || !audioUrl) {
      return createApiError('请提供角色图片和音频', 400);
    }

    if (!imageUrl.startsWith('http') || !audioUrl.startsWith('http')) {
      return createApiError('图片和音频必须是公网可访问的URL', 400);
    }

    const result = await submitDigitalHumanTask({ imageUrl, audioUrl, resolution });
    if (!result.taskId) {
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
        content: `数字人视频生成 · ${resolution || '720P'}`,
        content_type: 'video',
        metadata: {
          source: 'digital_human',
          batchId,
          imageUrl,
          audioUrl,
          taskId: result.taskId,
          resolution: resolution || '720P',
        },
      });
    }

    return createApiResponse({
      taskId: result.taskId,
      batchId,
    }, '数字人任务已提交');
  } catch (error) {
    console.error('Digital human submit error:', error);
    return createApiError('提交失败', 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return createApiError('缺少 taskId', 400);
    }

    const result = await getDigitalHumanTaskStatus(taskId);
    return createApiResponse(result);
  } catch (error) {
    console.error('Digital human query error:', error);
    return createApiError('查询失败', 500);
  }
}
