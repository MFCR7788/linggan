// 热点 API 端点
import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取热点列表
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPaginationParams(searchParams);
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const keyword = searchParams.get('keyword');
  const importance = searchParams.get('importance');
  const credibility = searchParams.get('credibility');
  const timeRange = searchParams.get('timeRange');
  const sortBy = searchParams.get('sortBy') || 'captured_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  const supabase = createAdminClient();

  let query = supabase
    .from('hot_items')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id);

  if (status) query = query.eq('status', status);
  if (platform) query = query.eq('platform', platform);
  if (keyword) {
    // 转义 LIKE 通配符，防止意外匹配或性能问题
    const escaped = keyword.replace(/[%_]/g, '\\$&');
    query = query.ilike('title', `%${escaped}%`);
  }
  if (importance) {
    const importanceValues = importance.split(',').filter(Boolean);
    if (importanceValues.length === 1) {
      query = query.eq('importance_level', importanceValues[0]);
    } else {
      query = query.in('importance_level', importanceValues);
    }
  }
  if (credibility) query = query.eq('credibility_level', credibility);
  const isRead = searchParams.get('isRead');
  if (isRead === 'false') query = query.eq('is_read', false);
  if (isRead === 'true') query = query.eq('is_read', true);
  const monitorKeywordId = searchParams.get('monitorKeywordId');
  if (monitorKeywordId) query = query.eq('monitor_keyword_id', monitorKeywordId);

  // 时间范围筛选
  if (timeRange) {
    const now = new Date();
    let dateFrom: Date | null = null;
    switch (timeRange) {
      case '1h':
        dateFrom = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'today':
        dateFrom = new Date(now);
        dateFrom.setHours(0, 0, 0, 0);
        break;
      case '7d':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    if (dateFrom) {
      query = query.gte('captured_at', dateFrom.toISOString());
    }
  }

  // 排序
  const allowedSortFields = ['captured_at', 'relevance_score', 'created_at', 'published_at'];
  const actualSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'captured_at';
  const actualSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  const { data, error, count } = await query
    .order(actualSortBy, { ascending: actualSortOrder === 'asc' })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('获取热点列表失败:', error);
    return createApiError('获取热点列表失败', 500);
  }

  // 计算热度值
  const enrichedData = (data || []).map((item: Record<string, unknown>) => ({
    ...item,
    heatScore: item.relevance_score as number ||
      Math.min(100, (item.view_count as number || 0) + (item.like_count as number || 0) * 2 +
        (item.comment_count as number || 0) * 3 + (item.share_count as number || 0) * 5),
  }));

  return createPaginatedResponse(enrichedData, page, limit, count || 0);
});

// 创建热点
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { platform, title, original_url, original_content, relevance_score } = body;

  if (!platform || !title || !original_url) {
    return createApiError('platform, title, original_url 为必填项', 400);
  }

  // 校验 URL 格式
  try {
    const parsed = new URL(original_url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return createApiError('original_url 必须是 http 或 https 链接', 400);
    }
  } catch {
    return createApiError('original_url 格式无效', 400);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('hot_items')
    .insert({
      user_id: user.id,
      platform,
      original_url,
      title,
      original_content: original_content || null,
      relevance_score: relevance_score || null,
      status: 'new',
    })
    .select()
    .single();

  if (error) {
    console.error('创建热点失败:', error);
    return createApiError('创建热点失败', 500);
  }

  return createApiResponse(data, '热点创建成功');
});
