import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

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

  console.time('[Keywords] 总耗时');

  // 检查是否已存在
  console.time('[Keywords] 查重');
  const { data: existing } = await supabase
    .from('monitor_keywords')
    .select('id')
    .eq('user_id', user.id)
    .eq('keyword', keyword.trim())
    .maybeSingle();
  console.timeEnd('[Keywords] 查重');

  if (existing) {
    return createApiError('该关键词已存在', 409);
  }

  const insertData: Record<string, any> = {
    user_id: user.id,
    keyword: keyword.trim(),
    platforms: platforms || [],
    frequency: frequency || 'daily',
    importance_threshold: importance_threshold || 50,
    is_active: true,
  };
  if (category) insertData.category = category;

  console.time('[Keywords] 插入关键词');
  const { data: newKeyword, error } = await supabase
    .from('monitor_keywords')
    .insert(insertData)
    .select()
    .single();
  console.timeEnd('[Keywords] 插入关键词');

  if (error) {
    console.error('创建关键词失败:', error);
    return createApiError('创建关键词失败', 500);
  }

  // 复用已有热点：同关键词其他用户已抓取的热点，直接复制给新用户
  let inheritedCount = 0;
  try {
    const normalizedKw = keyword.trim().toLowerCase();

    // 找到同关键词（忽略大小写）的其他用户的 monitor_keyword 及其热点
    console.time('[Keywords] 查兄弟关键词');
    const { data: siblingKeywords } = await supabase
      .from('monitor_keywords')
      .select('id')
      .neq('user_id', user.id)
      .ilike('keyword', normalizedKw);
    console.timeEnd('[Keywords] 查兄弟关键词');

    if (siblingKeywords && siblingKeywords.length > 0) {
      const siblingIds = siblingKeywords.map((k: any) => k.id);

      // 获取这些关键词关联的已抓取热点（去重：按 original_url 或 platform+title）
      console.time('[Keywords] 查已有热点');
      const { data: existingHotspots } = await supabase
        .from('hot_items')
        .select('platform, original_url, title, original_content, author, ai_summary, relevance_reason, key_points, creation_suggestions, view_count, like_count, comment_count, share_count, relevance_score, importance_level, credibility_level, credibility_score, published_at, captured_at')
        .in('monitor_keyword_id', siblingIds)
        .order('captured_at', { ascending: false })
        .limit(50);
      console.timeEnd('[Keywords] 查已有热点');

      if (existingHotspots && existingHotspots.length > 0) {
        // 去重：同一个 URL 或 平台+标题 只复制一份
        const seen = new Set<string>();
        const toInsert: any[] = [];

        // 一次性查出新用户已有的所有热点 URL，避免循环内逐条查询
        const urlsToCheck = [...new Set(existingHotspots.map((h: any) => h.original_url).filter(Boolean))];
        console.time('[Keywords] 查用户已有URL');
        const { data: userExisting } = await supabase
          .from('hot_items')
          .select('original_url')
          .eq('user_id', user.id)
          .in('original_url', urlsToCheck.length > 0 ? urlsToCheck : ['__none__']);
        const userUrlSet = new Set((userExisting || []).map((h: any) => h.original_url));
        console.timeEnd('[Keywords] 查用户已有URL');

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
          console.time('[Keywords] 批量插入热点');
          const { error: copyError } = await supabase
            .from('hot_items')
            .insert(toInsert);
          console.timeEnd('[Keywords] 批量插入热点');
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
  console.timeEnd('[Keywords] 总耗时');

  return createApiResponse(
    { ...newKeyword, inheritedHotspots: inheritedCount },
    inheritedCount > 0 ? `关键词添加成功，继承 ${inheritedCount} 条已有热点` : '关键词添加成功'
  );
});
