// 标签 API 端点
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取标签列表
export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取标签失败:', error);
    return createApiError('获取标签失败', 500);
  }

  return createApiResponse(data || []);
});

// 创建标签
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { name, color } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return createApiError('标签名称不能为空', 400);
  }
  if (name.trim().length > 20) {
    return createApiError('标签名称不能超过20个字符', 400);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      name: name.trim(),
      color: color || '#3B82F6'
    })
    .select()
    .single();

  if (error) {
    console.error('创建标签失败:', error);
    return createApiError('创建标签失败', 500);
  }

  return createApiResponse(data, '标签创建成功');
});
