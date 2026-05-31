// 标记所有热点为已读
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('hot_items')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) {
    console.error('标记已读失败:', error);
    return createApiError('操作失败', 500);
  }

  return createApiResponse(null, '已全部标记为已读');
});
