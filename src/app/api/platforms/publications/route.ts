// 发布记录列表
// GET /api/platforms/publications?status=published&platform=wechat_mp&limit=20&offset=0

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const platform = url.searchParams.get('platform');
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

  let query = createAdminClient()
    .from('publications')
    .select(`
      id, platform, title, content, cover_url, status, is_manual_post,
      external_url, external_post_id, scheduled_publish_at, published_at,
      created_at, updated_at,
      platform_accounts:account_id (account_name, account_avatar)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (platform) query = query.eq('platform', platform);

  const { data, error, count } = await query;
  if (error) return createApiError(error.message, 500);
  return createApiResponse({ publications: data || [], total: count || 0 });
});
