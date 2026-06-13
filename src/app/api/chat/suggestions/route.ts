// 用户选题建议 API
// GET  /api/chat/suggestions — 获取最新未读建议
// POST /api/chat/suggestions — 标记建议为已读

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20);

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('content_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('seen', false)
      .order('generated_at', { ascending: false })
      .limit(limit);

    return createApiResponse(data || []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) return createApiError('缺少 id 参数', 400);

    const supabase = createAdminClient();
    await supabase
      .from('content_suggestions')
      .update({ seen: true })
      .eq('id', id)
      .eq('user_id', user.id);

    return createApiResponse({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});
