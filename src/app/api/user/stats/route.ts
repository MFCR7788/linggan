// 用户统计数据 API 端点
import { createApiResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  // 灵感记录数（活跃的 content_items）
  const { count: inspirationCount, error: inspirationError } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (inspirationError) {
    console.error('获取灵感计数失败:', inspirationError);
  }

  // AI 作品数（有 AI 总结的内容）
  const { count: aiWorks, error: aiError } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .not('ai_summary', 'is', null);

  if (aiError) {
    console.error('获取AI作品计数失败:', aiError);
  }

  // 热点追踪数
  const { count: hotspotCount, error: hotspotError } = await supabase
    .from('hot_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (hotspotError) {
    console.error('获取热点计数失败:', hotspotError);
  }

  // 已发布数（is_shared = true 的内容）
  const { count: publishedCount, error: publishedError } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('is_shared', true);

  if (publishedError) {
    console.error('获取已发布计数失败:', publishedError);
  }

  return createApiResponse({
    inspirationCount: inspirationCount || 0,
    aiWorks: aiWorks || 0,
    hotspotCount: hotspotCount || 0,
    publishedCount: publishedCount || 0,
  });
});
