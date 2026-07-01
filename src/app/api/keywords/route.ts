import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { getBalance } from '@/lib/credits';
import type { CreditTier } from '@/lib/credits';

export const dynamic = 'force-dynamic';

const TIER_KEYWORD_LIMITS: Record<CreditTier, number> = {
  free: 1,
  basic: 2,
  pro: 5,
  studio: 10,
  enterprise: 20,
};

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

  // 层级限制检查：按 subscription tier 限制监控词数量
  const { tier } = await getBalance(user.id);
  const limit = TIER_KEYWORD_LIMITS[tier] ?? 1;

  const { count: activeCount } = await supabase
    .from('monitor_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (activeCount !== null && activeCount >= limit) {
    const tierNames: Record<string, string> = {
      free: '免费版', basic: '个人版', pro: '创作者版', studio: '工作室版', enterprise: '企业版',
    };
    const tierName = tierNames[tier] || '当前套餐';
    const tierOrder: CreditTier[] = ['free', 'basic', 'pro', 'studio', 'enterprise'];
    const currentIdx = tierOrder.indexOf(tier);
    const nextTier = currentIdx >= 0 && currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null;
    return createApiError(
      `${tierName}最多创建 ${limit} 个监控词，你已有 ${activeCount} 个。`,
      403,
      'KEYWORD_LIMIT_REACHED',
      { tier, limit, activeCount, nextTier: nextTier || undefined }
    );
  }

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

  // 校验 platforms
  const validPlatforms = ['weibo', 'douyin', 'xiaohongshu', 'bilibili', 'zhihu', 'baidu', 'toutiao'];
  const safePlatforms = Array.isArray(platforms)
    ? platforms.filter((p: any) => typeof p === 'string' && validPlatforms.includes(p))
    : [];

  // 校验 frequency
  const validFrequencies = ['realtime', 'hourly', 'daily', 'weekly'];
  const safeFrequency = validFrequencies.includes(frequency) ? frequency : 'daily';

  // 校验 importance_threshold
  const rawThreshold = Number(importance_threshold);
  const safeThreshold = isNaN(rawThreshold) ? 50 : Math.min(100, Math.max(0, rawThreshold));

  const insertData: Record<string, any> = {
    user_id: user.id,
    keyword: keyword.trim(),
    platforms: safePlatforms,
    frequency: safeFrequency,
    importance_threshold: safeThreshold,
    is_active: true,
  };
  if (category) insertData.category = category;

  const { data: newKeyword, error } = await supabase
    .from('monitor_keywords')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error || !newKeyword) {
    console.error('创建关键词失败:', error);
    return createApiError('创建关键词失败', 500);
  }

  // 复用已有热点：同关键词其他用户已抓取的热点，直接复制给新用户
  let inheritedCount = 0;
  try {
    const normalizedKw = keyword.trim().toLowerCase();

    // 找到同关键词（忽略大小写）的其他用户的 monitor_keyword 及其热点
    const { data: siblingKeywords } = await supabase
      .from('monitor_keywords')
      .select('id')
      .neq('user_id', user.id)
      .ilike('keyword', normalizedKw);

    if (siblingKeywords && siblingKeywords.length > 0) {
      const siblingIds = siblingKeywords.map((k: any) => k.id);

      // 获取这些关键词关联的已抓取热点（去重：按 original_url 或 platform+title）
      const { data: existingHotspots } = await supabase
        .from('hot_items')
        .select('platform, original_url, title, original_content, author, ai_summary, relevance_reason, key_points, creation_suggestions, view_count, like_count, comment_count, share_count, relevance_score, importance_level, credibility_level, credibility_score, published_at, captured_at')
        .in('monitor_keyword_id', siblingIds)
        .order('captured_at', { ascending: false })
        .limit(50);

      if (existingHotspots && existingHotspots.length > 0) {
        // 去重：同一个 URL 或 平台+标题 只复制一份
        const seen = new Set<string>();
        const toInsert: any[] = [];

        // 一次性查出新用户已有的所有热点 URL，避免循环内逐条查询
        const urlsToCheck = [...new Set(existingHotspots.map((h: any) => h.original_url).filter(Boolean))];
        const { data: userExisting } = await supabase
          .from('hot_items')
          .select('original_url')
          .eq('user_id', user.id)
          .in('original_url', urlsToCheck.length > 0 ? urlsToCheck : ['__none__']);
        const userUrlSet = new Set((userExisting || []).map((h: any) => h.original_url));

        for (const h of existingHotspots) {
          const urlKey = h.original_url || '';
          const titleKey = `${h.platform}::${h.title}`;
          if (seen.has(urlKey) || seen.has(titleKey)) continue;
          seen.add(urlKey);
          seen.add(titleKey);

          // 内存中检查新用户是否已有
          if (urlKey && userUrlSet.has(urlKey)) continue;

          toInsert.push({
            user_id: user.id,
            monitor_keyword_id: newKeyword.id,
            platform: h.platform,
            original_url: h.original_url,
            title: h.title,
            original_content: h.original_content,
            author: h.author,
            ai_summary: h.ai_summary,
            relevance_reason: h.relevance_reason,
            key_points: h.key_points || [],
            creation_suggestions: h.creation_suggestions || [],
            view_count: h.view_count || 0,
            like_count: h.like_count || 0,
            comment_count: h.comment_count || 0,
            share_count: h.share_count || 0,
            relevance_score: h.relevance_score,
            importance_level: h.importance_level,
            credibility_level: h.credibility_level,
            credibility_score: h.credibility_score,
            status: 'new',
            is_read: false,
            published_at: h.published_at,
            captured_at: h.captured_at || new Date().toISOString(),
          });
        }

        if (toInsert.length > 0) {
          const { error: copyError } = await supabase
            .from('hot_items')
            .insert(toInsert);
          if (!copyError) {
            inheritedCount = toInsert.length;
            console.log(`[Keywords] 新用户 ${user.id.slice(0, 8)} 继承 ${inheritedCount} 条已有热点`);
          } else {
            console.error('[Keywords] 复制热点失败:', copyError.message);
          }
        }
      }
    }
  } catch (copyErr) {
    console.error('[Keywords] 复用热点异常:', copyErr);
    // 不影响关键词创建，静默处理
  }
  return createApiResponse(
    { ...newKeyword, inheritedHotspots: inheritedCount },
    inheritedCount > 0 ? `关键词添加成功，继承 ${inheritedCount} 条已有热点` : '关键词添加成功'
  );
});
