import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { generateCopywriting, logAiUsage } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createUnauthorizedResponse();
    }

    const { inspirations, type, style, noAiTaste, n } = await request.json();

    if (!inspirations || !Array.isArray(inspirations)) {
      return createApiError('Inspirations array is required', 400);
    }

    // 将类型ID转换为中文描述
    const typeLabels: Record<string, string> = {
      xiaohongshu: '小红书文案',
      script: '短视频脚本',
      wechat: '公众号文章',
    };
    const typeLabel = typeLabels[type] || type || '小红书文案';
    const count = Math.min(n || 1, 5);

    const result = await generateCopywriting(inspirations, typeLabel, style || '小红书博主风', noAiTaste || false, count);

    // 记录AI使用
    await logAiUsage(user.id, 'copywriting', 1000 * count);

    // 保存到"AI创作"作品集
    if (!noAiTaste) {
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
        const content = Array.isArray(result) ? result.join('\n\n---\n\n') : result;
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          user_id: user.id,
          type: 'ai',
          content,
          content_type: 'text',
          metadata: { source: 'ai_creation', copywritingType: type },
        });
      }
    }

    return createApiResponse({
      content: result,
      type,
      style,
      isBatch: count > 1,
    }, 'Copywriting generated');
  } catch (error) {
    console.error('AI copywriting error:', error);
    return createApiError('Failed to generate copywriting', 500);
  }
}
