// 灵感 API 端点
import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { stripMarkdown } from '@/lib/text-utils';

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
  // ─── AI 创作 Step 1 专用过滤(向后兼容,默认不过滤) ───
  // excludeSourcePlatforms: 逗号分隔,显式排除(如 'ai' 用于 Step 1)
  // includeSourcePlatforms: 逗号分隔,显式包含(覆盖 exclude)
  // minOriginalLength: 原文最小字符数,默认 0
  // minAiSummaryLength: ai_summary 最小字符数,默认 0
  // 注意: 默认不传 excludeSourcePlatforms 时,所有 source_platform 都显示(不影响 /inspiration 主页)
  const excludeSourcePlatforms = (searchParams.get('excludeSourcePlatforms') || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const includeSourcePlatforms = (searchParams.get('includeSourcePlatforms') || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const minOriginalLength = parseInt(searchParams.get('minOriginalLength') || '0', 10);
  const minAiSummaryLength = parseInt(searchParams.get('minAiSummaryLength') || '0', 10);

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

      // 应用 sourcePlatform 排除/包含逻辑
      if (includeSourcePlatforms.length > 0) {
        query = query.in('source_platform', includeSourcePlatforms);
      } else if (excludeSourcePlatforms.length > 0) {
        // PostgREST:用 .not('source_platform', 'in', '(...)') 形式
        // supabase-js 接受字符串表示数组,格式为 (item1,item2)
        const arr = `(${excludeSourcePlatforms.join(',')})`;
        query = query.filter('source_platform', 'not.in', arr);
      }

      // 最小长度过滤(过滤空内容)—— PostgREST length() 在 filter 中不被识别,改用
      // .not('column', 'is', null) 兜底
      if (minOriginalLength > 0) {
        query = query.not('original_text', 'is', null);
      }
      if (minAiSummaryLength > 0) {
        query = query.not('ai_summary', 'is', null);
      }

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

  // 应用 sourcePlatform 排除/包含逻辑
  if (includeSourcePlatforms.length > 0) {
    query = query.in('source_platform', includeSourcePlatforms);
  } else if (excludeSourcePlatforms.length > 0) {
    const arr = `(${excludeSourcePlatforms.join(',')})`;
    query = query.filter('source_platform', 'not.in', arr);
  }

  // 最小长度过滤(过滤空内容)
  if (minOriginalLength > 0) {
    query = query.not('original_text', 'is', null);
  }
  if (minAiSummaryLength > 0) {
    query = query.not('ai_summary', 'is', null);
  }

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
  const { type, title, original_text, summary, category_id, tags, source_url, source_platform, media_urls, workflow_session_id, prompt } = body;

  if (!type) {
    return createApiError('内容类型不能为空', 400);
  }
  if (title && typeof title === 'string' && title.length > 200) {
    return createApiError('标题不能超过200个字符', 400);
  }
  if (original_text && typeof original_text === 'string' && original_text.length > 50000) {
    return createApiError('原文内容过长', 400);
  }
  // 校验 tags 数组
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(t => typeof t !== 'string' || t.trim().length === 0 || t.length > 30))) {
    return createApiError('标签格式无效', 400);
  }
  // 校验 media_urls 数组
  if (media_urls !== undefined && (!Array.isArray(media_urls) || media_urls.some(u => typeof u !== 'string' || u.length > 500))) {
    return createApiError('媒体链接格式无效', 400);
  }

  // 校验并映射类型：数据库 CHECK 约束允许 'text','voice','image','video','link','audio'
  const VALID_TYPES = ['text', 'voice', 'image', 'video', 'link', 'audio'];
  if (!VALID_TYPES.includes(type)) {
    return createApiError(`无效的内容类型: ${type}，允许: ${VALID_TYPES.join(', ')}`, 400);
  }
  const normalizedType = type;

  const supabase = createAdminClient();

  // 如果未指定 category_id，根据 type 自动分配到对应分类
  const isValidUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  let effectiveCategoryId: string | null = (category_id && isValidUUID(category_id)) ? category_id : null;

  if (!effectiveCategoryId) {
    const typeToCategory: Record<string, string> = {
      image: '图片', video: '视频', text: '灵感', voice: '灵感', link: '灵感', audio: '音频',
    };
    const catName = typeToCategory[normalizedType] || '灵感';
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', catName)
      .single();
    effectiveCategoryId = cat?.id || null;
  }

  console.log('[POST] Saving inspiration for user:', user.id, 'type:', normalizedType, 'title:', title);

  const { data, error } = await supabase
    .from('content_items')
    .insert({
      user_id: user.id,
      type: normalizedType,
      title: title ? stripMarkdown(title) : null,
      original_text: original_text || null,
      ai_summary: summary || null,
      category_id: effectiveCategoryId,
      source_url: source_url || null,
      source_platform: source_platform || null,
      media_urls: media_urls || null,
      workflow_session_id: workflow_session_id || null,
      prompt: prompt || null,
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
