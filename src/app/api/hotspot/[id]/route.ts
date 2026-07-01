// 单个热点详情 API
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取单个热点详情
export const GET = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('hot_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    if (!data || error?.code === 'PGRST116') {
      return createApiError('热点不存在', 404);
    }
    console.error('获取热点详情失败:', error);
    return createApiError('获取热点详情失败', 500);
  }

  // 获取相关热点（同平台的其他热点）
  const { data: related } = await supabase
    .from('hot_items')
    .select('id, title, platform, relevance_score')
    .eq('user_id', user.id)
    .neq('id', id)
    .order('captured_at', { ascending: false })
    .limit(5);

  // AI 分析辅助字段
  const keyPoints = data.key_points || [];
  const creationSuggestions = data.creation_suggestions || [];

  // 热度评分（综合 view/like/comment/share + relevance_score）
  const heatScore = data.relevance_score ||
    Math.min(100, (data.view_count || 0) + (data.like_count || 0) * 2 +
      (data.comment_count || 0) * 3 + (data.share_count || 0) * 5);

  return createApiResponse({
    ...data,
    keyPoints,
    creationSuggestions,
    heatScore: Math.min(100, heatScore),
    relatedHotspots: related || [],
  });
});

// 更新热点状态（标记跟进/已使用/已忽略/已读）
export const PATCH = withAuth(async ({ request, params, user }) => {
  const { id } = params;
  const body = await request.json();
  const { status, is_read } = body;
  const validStatuses = ['new', 'following', 'used', 'ignored'];

  // 构建更新对象
  const updates: Record<string, unknown> = {};
  if (status) {
    if (!validStatuses.includes(status)) {
      return createApiError('状态值无效，可选: new, following, used, ignored', 400);
    }
    updates.status = status;
  }
  if (typeof is_read === 'boolean') {
    updates.is_read = is_read;
  }

  if (Object.keys(updates).length === 0) {
    return createApiError('至少需要提供 status 或 is_read', 400);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('hot_items')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('更新热点状态失败:', error);
    return createApiError('更新失败', 500);
  }

  return createApiResponse(null, '状态已更新');
});

// 删除单个热点（硬删除，关联通知的 hot_item_id 会自动置 NULL）
export const DELETE = withAuth(async ({ params, user }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('hot_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('删除热点失败:', error);
    return createApiError('删除失败', 500);
  }

  return createApiResponse(null, '已删除');
});
