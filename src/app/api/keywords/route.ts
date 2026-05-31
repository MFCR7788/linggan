import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 列出用户的关键词
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPaginationParams(searchParams);
  const isActive = searchParams.get('is_active');
  const category = searchParams.get('category');

  const supabase = createAdminClient();
  let query = supabase
    .from('monitor_keywords')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id);

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true');
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return createPaginatedResponse(data || [], page, limit, count || 0);
});

// 添加监控关键词
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { keyword, platforms, frequency, importance_threshold, category } = body;

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return createApiError('关键词不能为空', 400);
  }

  const supabase = createAdminClient();

  // 检查是否已存在
  const { data: existing } = await supabase
    .from('monitor_keywords')
    .select('id')
    .eq('user_id', user.id)
    .eq('keyword', keyword.trim())
    .maybeSingle();

  if (existing) {
    return createApiError('该关键词已存在', 409);
  }

  const insertData: Record<string, any> = {
    user_id: user.id,
    keyword: keyword.trim(),
    platforms: platforms || [],
    frequency: frequency || 'daily',
    importance_threshold: importance_threshold || 50,
    is_active: true,
  };
  if (category) insertData.category = category;

  const { data, error } = await supabase
    .from('monitor_keywords')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('创建关键词失败:', error);
    return createApiError('创建关键词失败', 500);
  }

  return createApiResponse(data, '关键词添加成功');
});
