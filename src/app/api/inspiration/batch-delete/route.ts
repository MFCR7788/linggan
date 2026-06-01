// 灵感批量操作 API
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { cleanupContentAssetsBatch } from '@/lib/storage/cleanup';
import { subtractStorageUsage } from '@/lib/upload/usage';

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

  // 先取要删除的记录（用于清理 storage + 扣减用量）
  const { data: items } = await supabase
    .from('content_items')
    .select('id, media_urls, original_file_url, original_file_size')
    .in('id', ids)
    .eq('user_id', user.id);

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

  // 异步清理 storage + 扣减用量
  if (items && items.length > 0) {
    cleanupContentAssetsBatch(items).catch((e) =>
      console.error('[Batch Delete] storage 清理失败:', e)
    );
    const totalBytes = items.reduce(
      (sum, it) => sum + (it.original_file_size || 0),
      0
    );
    if (totalBytes > 0) {
      subtractStorageUsage(user.id, totalBytes).catch((e) =>
        console.error('[Batch Delete] 扣减用量失败:', e)
      );
    }
  }

  return createApiResponse({ deleted: data?.length || 0 }, `成功删除 ${data?.length || 0} 条灵感`);
});
