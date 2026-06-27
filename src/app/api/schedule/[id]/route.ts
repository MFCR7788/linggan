import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取单个日程
export const GET = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return createApiError('日程不存在', 404);
  }

  // 如果有关联的灵感来源，一并返回 AI 分析数据
  let linkedInspiration = null;
  let relatedInspirations: any[] = [];
  if (data.source_content_id) {
    const { data: inspiration } = await supabase
      .from('content_items')
      .select('id, title, original_text, ai_summary, ai_key_points, ai_creation_suggestions, type, created_at')
      .eq('id', data.source_content_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (inspiration) {
      linkedInspiration = inspiration;

      // 查询关联灵感（共享标签或同分类，最多 5 条）
      const { data: linkedTags } = await supabase
        .from('content_tags')
        .select('tag_id')
        .eq('content_id', inspiration.id);

      const tagIds = (linkedTags || []).map((t: any) => t.tag_id);
      if (tagIds.length > 0) {
        const { data: relatedContentIds } = await supabase
          .from('content_tags')
          .select('content_id')
          .in('tag_id', tagIds);

        const relatedIds = [...new Set(
          (relatedContentIds || []).map((r: any) => r.content_id).filter((cid: string) => cid !== inspiration.id)
        )].slice(0, 20);

        if (relatedIds.length > 0) {
          const { data: related } = await supabase
            .from('content_items')
            .select('id, title, type, ai_summary, lifecycle, estimated_duration, created_at')
            .in('id', relatedIds)
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5);
          relatedInspirations = related || [];
        }
      }
    }
  }

  return createApiResponse({ ...data, linkedInspiration, relatedInspirations });
});

// 更新日程
export const PUT = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const body = await request.json();
  const { title, description, scheduled_at, location, color, status, remind_before, suggestions } = body;

  const supabase = createAdminClient();

  // 验证日程属于当前用户
  const { data: existing } = await supabase
    .from('schedules')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    return createApiError('日程不存在', 404);
  }

  const updateData: Record<string, any> = {};
  if (title !== undefined) {
    const t = String(title).trim();
    if (t.length === 0) return createApiError('日程标题不能为空', 400);
    if (t.length > 100) return createApiError('日程标题不能超过100个字符', 400);
    updateData.title = t;
  }
  if (description !== undefined) updateData.description = description;
  if (scheduled_at !== undefined) {
    if (isNaN(new Date(scheduled_at).getTime())) {
      return createApiError('日程时间格式无效', 400);
    }
    updateData.scheduled_at = scheduled_at;
  }
  if (location !== undefined) updateData.location = location;
  if (color !== undefined) updateData.color = color;
  if (status !== undefined) {
    const validStatuses = ['pending', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return createApiError('无效的日程状态', 400);
    }
    updateData.status = status;
  }
  if (remind_before !== undefined) updateData.remind_before = remind_before;
  if (suggestions !== undefined) updateData.suggestions = Array.isArray(suggestions) ? JSON.stringify(suggestions) : null;

  const { data, error } = await supabase
    .from('schedules')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('更新日程失败:', error);
    return createApiError('更新日程失败', 500);
  }

  return createApiResponse(data, '日程更新成功');
});

// 删除日程
export const DELETE = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('schedules')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    return createApiError('日程不存在', 404);
  }

  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('删除日程失败:', error);
    return createApiError('删除日程失败', 500);
  }

  return createApiResponse(null, '日程删除成功');
});
