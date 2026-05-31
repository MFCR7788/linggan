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

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      name,
      color
    })
    .select()
    .single();

  if (error) {
    console.error('创建标签失败:', error);
    return createApiError('创建标签失败', 500);
  }

  return createApiResponse(data, '标签创建成功');
});
