// 灵感 API 端点
import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取灵感列表
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPaginationParams(searchParams);
  const type = searchParams.get('type');
  const categoryId = searchParams.get('categoryId');
  const status = searchParams.get('status') || 'active';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const tagIds = searchParams.get('tagIds'); // 逗号分隔的 tag id 列表
  const sourcePlatform = searchParams.get('sourcePlatform'); // 按来源平台筛选（如 'ai'）

  const supabase = createAdminClient();

  // 如果按标签筛选，先查 content_tags 拿到 content_id 列表
  if (tagIds) {
    const tagIdList = tagIds.split(',').filter(Boolean);
    if (tagIdList.length > 0) {
      const { data: contentTags } = await supabase
        .from('content_tags')
        .select('content_id')
        .in('tag_id', tagIdList);

      const contentIds = (contentTags || []).map((ct: any) => ct.content_id);
      // 没有匹配的 content，直接返回空
      if (contentIds.length === 0) {
        return createPaginatedResponse([], page, limit, 0);
      }

      let query = supabase
        .from('content_items')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', status)
        .in('id', contentIds);

      if (type) query = query.eq('type', type);
      if (sourcePlatform) query = query.eq('source_platform', sourcePlatform);
      if (categoryId) query = query.eq('category_id', categoryId);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      const sortAsc = sortOrder === 'asc';
      const validSortFields = ['created_at', 'title', 'updated_at'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';

      const { data, error, count } = await query
        .order(sortField, { ascending: sortAsc })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('[GET] 获取灵感列表失败:', error);
        return createApiError('获取灵感列表失败', 500);
      }

      return createPaginatedResponse(data || [], page, limit, count || 0);
    }
  }

  let query = supabase
    .from('content_items')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('status', status);

  if (type) query = query.eq('type', type);
  if (sourcePlatform) query = query.eq('source_platform', sourcePlatform);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const sortAsc = sortOrder === 'asc';
  const validSortFields = ['created_at', 'title', 'updated_at'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';

  const { data, error, count } = await query
    .order(sortField, { ascending: sortAsc })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[GET] 获取灵感列表失败:', error);
    return createApiError('获取灵感列表失败', 500);
  }

  return createPaginatedResponse(data || [], page, limit, count || 0);
});

// 创建灵感
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { type, title, original_text, summary, category_id, tags, source_url, source_platform, media_urls } = body;

  if (!type) {
    return createApiError('内容类型不能为空', 400);
  }

  // 校验并映射类型：数据库 CHECK 约束只允许 'text','voice','image','video','link'
  const VALID_TYPES = ['text', 'voice', 'image', 'video', 'link'];
  const normalizedType = VALID_TYPES.includes(type) ? type : 'text';

  const supabase = createAdminClient();

  console.log('[POST] Saving inspiration for user:', user.id, 'type:', normalizedType, 'title:', title);

  const { data, error } = await supabase
    .from('content_items')
    .insert({
      user_id: user.id,
      type: normalizedType,
      title: title || null,
      original_text: original_text || null,
      ai_summary: summary || null,
      category_id: (category_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category_id)) ? category_id : null,
      source_url: source_url || null,
      source_platform: source_platform || null,
      media_urls: media_urls || null,
      status: 'active',
      analysis_status: 'completed',
    })
    .select()
    .single();

  if (error) {
    return createApiError('创建灵感失败: ' + error.message, 500);
  }

  // 如果有标签，创建标签关联
  if (tags && Array.isArray(tags) && tags.length > 0) {
    for (const tagName of tags) {
      // 查找或创建标签
      const { data: existingTag } = await supabase
        .from('tags')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', tagName)
        .single();

      let tagId: string | undefined;
      if (existingTag) {
        tagId = existingTag.id;
      } else {
        const { data: newTag } = await supabase
          .from('tags')
          .insert({ user_id: user.id, name: tagName })
          .select()
          .single();
        tagId = newTag?.id;
      }

      if (tagId) {
        await supabase
          .from('content_tags')
          .insert({ content_id: data.id, tag_id: tagId })
          .select();
      }
    }
  }

  return createApiResponse(data, '灵感创建成功');
});
