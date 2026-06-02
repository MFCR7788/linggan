// 手动录入数据 API
// POST /api/platforms/metrics-manual
// Body: { publicationId, views?, likes?, comments?, shares?, collects?, notes? }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { publicationId, views, likes, comments, shares, collects, notes } = body as {
    publicationId?: string;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    collects?: number | null;
    notes?: string | null;
  };

  if (!publicationId) {
    return createApiError('publicationId 必填', 400);
  }
  // 至少要有 1 个数字字段
  const hasData = [views, likes, comments, shares, collects].some((v) => v !== null && v !== undefined);
  if (!hasData && !notes) {
    return createApiError('至少填一项数据', 400);
  }

  const supabase = createAdminClient();
  // 验证 ownership
  const { data: pub } = await supabase
    .from('publications')
    .select('id')
    .eq('id', publicationId)
    .eq('user_id', user.id)
    .single();
  if (!pub) {
    return createApiError('无权限', 403);
  }

  const { error } = await supabase
    .from('publication_manual_metrics')
    .insert({
      publication_id: publicationId,
      views: views ?? null,
      likes: likes ?? null,
      comments: comments ?? null,
      shares: shares ?? null,
      collects: collects ?? null,
      notes: notes || null,
      recorded_by: user.id,
    });

  if (error) {
    return createApiError(error.message, 500);
  }

  return createApiResponse({ ok: true }, '已保存');
});
