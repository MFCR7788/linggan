// 通知 API 端点
import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取通知列表
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPaginationParams(searchParams);
  const type = searchParams.get('type');
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  const supabase = createAdminClient();

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id);

  if (type) query = query.eq('type', type);
  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('获取通知列表失败:', error);
    return createApiError('获取通知列表失败', 500);
  }

  return createPaginatedResponse(data || [], page, limit, count || 0);
});

// 标记通知为已读
export const PUT = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { id, markAll } = body;

  const supabase = createAdminClient();

  if (markAll) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('全部已读失败:', error);
      return createApiError('操作失败', 500);
    }
    return createApiResponse(null, '全部已读');
  }

  if (id) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('标记已读失败:', error);
      return createApiError('操作失败', 500);
    }
    return createApiResponse(null, '已标记为已读');
  }

  return createApiError('请提供通知ID', 400);
});
