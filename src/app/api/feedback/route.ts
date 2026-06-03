// 用户反馈 API
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { type, content, contact } = await request.json();

    if (!content || !content.trim()) {
      return createApiError('反馈内容不能为空', 400);
    }

    if (content.length > 2000) {
      return createApiError('反馈内容过长（最多 2000 字）', 400);
    }

    const validTypes = ['bug', 'feature', 'question', 'other'];
    const feedbackType = validTypes.includes(type) ? type : 'other';

    // 写入 Supabase feedback 表
    const supabase = createAdminClient();
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      type: feedbackType,
      content: content.trim(),
      contact: contact?.trim() || null,
      status: 'pending',
    });

    if (error) {
      console.error('[Feedback] 写入失败:', error.message);
      // 即使写入失败，也返回成功（用户体验优先）
      // 同时输出到日志供后续排查
      console.log('[Feedback] 降级日志:', JSON.stringify({ user_id: user.id, type: feedbackType, content: content.trim(), contact }));
    }

    return createApiResponse(null, '感谢您的反馈！');
  } catch (error) {
    console.error('[Feedback] Error:', error);
    return createApiError('提交失败，请稍后重试', 500);
  }
});
