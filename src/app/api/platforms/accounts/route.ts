// 用户授权账号管理
// GET /api/platforms/accounts — 列出当前用户的所有授权账号
// DELETE /api/platforms/accounts?accountId=xxx — 解除授权

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('id, platform, account_name, account_avatar, open_id, expires_at, scope, status, last_used_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return createApiError(error.message, 500);
  return createApiResponse({ accounts: data || [] });
});

export const DELETE = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) return createApiError('accountId 必填', 400);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('platform_accounts')
    .update({ status: 'revoked' })
    .eq('id', accountId)
    .eq('user_id', user.id);

  if (error) return createApiError(error.message, 500);
  return createApiResponse({ ok: true }, '已解除授权');
});
