// 灵感批量操作 API
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 批量删除灵感（软删除）
export const POST = withAuth(async ({ request, user }) => {
  const { ids } = await request.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return createApiError('请选择要删除的灵感', 400);
  }

  if (ids.length > 100) {
    return createApiError('单次最多删除 100 条', 400);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('content_items')
    .update({ status: 'deleted' })
    .in('id', ids)
    .eq('user_id', user.id)
    .select();

  if (error) {
    console.error('[Batch Delete] 批量删除失败:', error);
    return createApiError('批量删除失败', 500);
  }

  return createApiResponse({ deleted: data?.length || 0 }, `成功删除 ${data?.length || 0} 条灵感`);
});
