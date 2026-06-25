// 定时清理 30 天以上的 chat_messages 和孤立 chat_sessions
// V2.0 C6：对话持久化 — 延长保留至 30 天，对称清理 user + AI 消息
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
    return createApiError('未授权访问', 401);
  }

  // V2.0: 从 7 天改为 30 天
  const retentionDays = parseInt(searchParams.get('days') || '30', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[Cron] Cleaning up chat_messages older than ${cutoff} (${retentionDays} days)`);

  try {
    const supabase = createAdminClient();

    // 对称删除所有 30 天前的消息（user + AI），不再只按 ai_creation 过滤
    const { count: msgCount, error } = await supabase
      .from('chat_messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    if (error) {
      console.error('[Cron] cleanup-history error:', error);
      return createApiError('清理失败', 500);
    }

    // 清理没有剩余消息的孤立 chat_sessions
    let orphanCount = 0;
    try {
      // 先找出所有有消息的 session
      const { data: activeSessions } = await supabase
        .from('chat_messages')
        .select('session_id')
        .limit(1);

      if (activeSessions && activeSessions.length === 0) {
        // 所有 session 都是孤立的（极端情况），清理所有
        const { count: c } = await supabase
          .from('chat_sessions')
          .delete({ count: 'exact' })
          .lt('created_at', cutoff);
        orphanCount = c || 0;
      } else {
        // 只删除 cutoff 前创建且无消息的 session
        const { data: liveSessionIds } = await supabase
          .from('chat_messages')
          .select('session_id');
        const liveIds = new Set((liveSessionIds || []).map((m: any) => m.session_id));

        if (liveIds.size > 0) {
          const { count: c } = await supabase
            .from('chat_sessions')
            .delete({ count: 'exact' })
            .lt('created_at', cutoff)
            .not('id', 'in', `(${Array.from(liveIds).join(',')})`);
          orphanCount = c || 0;
        }
      }
    } catch (e) {
      console.warn('[Cron] 清理孤立 session 失败:', e);
    }

    console.log(`[Cron] Deleted ${msgCount} messages, ${orphanCount} orphan sessions`);
    return createApiResponse(
      { deleted: msgCount, orphanSessions: orphanCount, cutoff, retentionDays },
      `清理完成，删除 ${msgCount} 条消息，${orphanCount} 个孤立会话`
    );
  } catch (e) {
    console.error('[Cron] cleanup-history fatal:', e);
    return createApiError('清理失败', 500);
  }
}
