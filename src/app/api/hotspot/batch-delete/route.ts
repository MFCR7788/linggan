// 热点批量操作 API
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 批量删除热点（支持按 ID 列表或按筛选条件）
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { ids, filters } = body;

  const supabase = createAdminClient();

  // 方式 1：按 ID 列表删除
  if (ids && Array.isArray(ids) && ids.length > 0) {
    if (ids.length > 100) {
      return createApiError('单次最多删除 100 条', 400);
    }

    const { data, error } = await supabase
      .from('hot_items')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id)
      .select('id');

    if (error) {
      console.error('[Batch Delete] 批量删除失败:', error);
      return createApiError('批量删除失败', 500);
    }

    return createApiResponse({ deleted: data?.length || 0 }, `成功删除 ${data?.length || 0} 条热点`);
  }

  // 方式 2：按筛选条件删除
  if (filters) {
    let query = supabase
      .from('hot_items')
      .delete()
      .eq('user_id', user.id);

    if (filters.platform) query = query.eq('platform', filters.platform);
    if (filters.importance) query = query.eq('importance_level', filters.importance);
    if (filters.credibility) query = query.eq('credibility_level', filters.credibility);
    if (filters.status) query = query.eq('status', filters.status);

    if (filters.timeRange) {
      const now = new Date();
      let dateFrom: string | null = null;
      switch (filters.timeRange) {
        case '1h':
          dateFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
          break;
        case 'today':
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          dateFrom = today.toISOString();
          break;
        case '7d':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case '30d':
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }
      if (dateFrom) query = query.gte('captured_at', dateFrom);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('[Filter Delete] 按筛选删除失败:', error);
      return createApiError('删除失败', 500);
    }

    return createApiResponse({ deleted: data?.length || 0 }, `成功删除 ${data?.length || 0} 条热点`);
  }

  return createApiError('请提供要删除的热点 ID 或筛选条件', 400);
});
