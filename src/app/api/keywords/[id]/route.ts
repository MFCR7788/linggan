import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 切换激活/暂停
export const PATCH = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const body = await request.json();
  const supabase = createAdminClient();

  // 验证所有权
  const { data: existing } = await supabase
    .from('monitor_keywords')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    return createApiError('关键词不存在', 404);
  }

  const updates: Record<string, any> = {};
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.keyword) updates.keyword = body.keyword;
  if (body.platforms) updates.platforms = body.platforms;
  if (body.frequency) updates.frequency = body.frequency;
  if (body.importance_threshold !== undefined) updates.importance_threshold = body.importance_threshold;
  if (body.category !== undefined) updates.category = body.category;

  const { data, error } = await supabase
    .from('monitor_keywords')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error || !data) throw error || new Error('更新失败');
  return createApiResponse(data, '更新成功');
});

// 删除关键词（级联清理关联的热点）
export const DELETE = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  // 先验证所有权
  const { data: existing } = await supabase
    .from('monitor_keywords')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!existing) {
    return createApiError('关键词不存在', 404);
  }

  const { count: hotCount } = await supabase
    .from('hot_items')
    .delete({ count: 'exact' })
    .eq('monitor_keyword_id', id)
    .eq('user_id', user.id);

  const { error } = await supabase
    .from('monitor_keywords')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;
  return createApiResponse({ removedHotspots: hotCount ?? 0 }, '删除成功');
});
