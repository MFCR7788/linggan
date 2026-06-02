// 发布记录管理
// GET /api/platforms/publications/[id] — 查看单条
// PATCH /api/platforms/publications/[id] — 更新(回填 externalUrl / 状态变化)
// DELETE /api/platforms/publications/[id] — 删除

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params, user }) => {
  const { id } = params as { id: string };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('publications')
    .select(`
      *,
      platform_accounts:account_id (account_name, account_avatar, open_id)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (error) return createApiError(error.message, 404);
  return createApiResponse({ publication: data });
});

export const PATCH = withAuth(async ({ request, params, user }) => {
  const { id } = params as { id: string };
  const body = await request.json();
  const allowed = ['external_url', 'status', 'tags', 'published_at', 'error_message'] as const;
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.status === 'published' && !update.published_at) {
    update.published_at = new Date().toISOString();
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('publications')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) return createApiError(error.message, 500);
  return createApiResponse({ publication: data }, '已更新');
});

export const DELETE = withAuth(async ({ params, user }) => {
  const { id } = params as { id: string };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('publications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return createApiError(error.message, 500);
  return createApiResponse({ ok: true }, '已删除');
});
