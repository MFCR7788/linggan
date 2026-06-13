// 定时清理 7 天以上的 chat_messages（AI Chat 自动保存的临时历史）
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { getCronSecret } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expectedSecret = getCronSecret();
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置', 500);
  }
  const { searchParams } = new URL(request.url);
  const secret =
    searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return createApiError('Unauthorized', 401);
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[Cron] Cleaning up chat_messages older than ${cutoff}`);

  try {
    const supabase = createAdminClient();

    // 删除 7 天前包含 ai_creation 的 AI 消息
    const { count, error } = await supabase
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('type', 'ai')
      .contains('metadata', { source: 'ai_creation' })
      .lt('created_at', cutoff);

    if (error) {
      console.error('[Cron] cleanup-history error:', error);
      return createApiError('清理失败', 500);
    }

    console.log(`[Cron] Deleted ${count} old AI chat messages`);
    return createApiResponse(
      { deleted: count, cutoff },
      `清理完成，删除 ${count} 条 7 天前的 AI 历史记录`
    );
  } catch (e) {
    console.error('[Cron] cleanup-history fatal:', e);
    return createApiError('清理失败', 500);
  }
}
