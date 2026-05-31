// 单个灵感详情 API 端点
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取单个灵感详情
export const GET = withAuth(async ({ user, params }) => {
  const { id } = params;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('content_items')
    .select(`
      *,
      categories (
        id,
        name,
        icon,
        color
      ),
      content_tags (
        tags (
          id,
          name,
          color
        )
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiError('灵感不存在', 404);
    }
    return createApiError('获取灵感详情失败', 500);
  }

  return createApiResponse(data);
});

// 更新灵感
export const PUT = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const updateData = await request.json();

  // 移除不允许直接修改的字段
  delete updateData.user_id;
  delete updateData.created_at;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('content_items')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiError('灵感不存在', 404);
    }
    return createApiError('更新灵感失败', 500);
  }

  return createApiResponse(data, '灵感更新成功');
});

// 删除灵感（软删除）
export const DELETE = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('content_items')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiError('灵感不存在', 404);
    }
    return createApiError('删除灵感失败', 500);
  }

  return createApiResponse(data, '灵感删除成功');
});
