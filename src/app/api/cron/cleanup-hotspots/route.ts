// 定时清理一个月以上的旧热点
// 由 GitHub Actions 每月 1 号 UTC 16:00（北京时间 0:00）触发
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置,拒绝执行', 500);
  }
  const { searchParams } = new URL(request.url);
  const secret =
    searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return createApiError('Unauthorized', 401);
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[Cron] Cleaning up hotspots older than ${cutoff}`);

  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from('hot_items')
      .delete({ count: 'exact' })
      .lt('captured_at', cutoff);

    if (error) {
      console.error('[Cron] cleanup-hotspots error:', error);
      return createApiError('清理失败', 500);
    }

    console.log(`[Cron] Deleted ${count} old hotspots`);
    return createApiResponse(
      { deleted: count, cutoff },
      `清理完成，删除 ${count} 条一个月以上的热点`
    );
  } catch (e) {
    console.error('[Cron] cleanup-hotspots fatal:', e);
    return createApiError('清理失败', 500);
  }
}
