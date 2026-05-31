// 热点统计 API 端点
import { createApiResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取热点统计
export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userId = user.id;

  // 并行查询各项统计
  const [
    totalResult, todayResult, urgentResult, sourceResult, unreadResult,
    activeKwResult, lastCheckResult,
  ] = await Promise.all([
    supabase.from('hot_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('hot_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('captured_at', today.toISOString()),
    supabase.from('hot_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('importance_level.eq.high,importance_level.eq.urgent'),
    supabase.from('hot_items').select('platform', { count: 'exact', head: false }).eq('user_id', userId),
    supabase.from('hot_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false),
    supabase.from('monitor_keywords').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    supabase.from('monitor_keywords').select('last_check_at').eq('user_id', userId).eq('is_active', true).order('last_check_at', { ascending: false }).limit(1),
  ]);

  // 统计来源分布
  let bySource: Record<string, number> = {};
  if (sourceResult.data) {
    bySource = (sourceResult.data as any[]).reduce((acc: Record<string, number>, item: any) => {
      const platform = item.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});
  }

  // 最近一次检查时间
  const lastCheckAt = (lastCheckResult.data as any[])?.[0]?.last_check_at || null;

  return createApiResponse({
    total: totalResult.count || 0,
    today: todayResult.count || 0,
    urgent: urgentResult.count || 0,
    unread: unreadResult.count || 0,
    activeKeywords: activeKwResult.count || 0,
    lastCheckAt,
    bySource,
  });
});
