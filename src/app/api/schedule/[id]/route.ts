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
  if (data.source_content_id) {
    const { data: inspiration } = await supabase
      .from('content_items')
      .select('id, title, original_text, ai_summary, ai_key_points, ai_creation_suggestions, type, created_at')
      .eq('id', data.source_content_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (inspiration) {
      linkedInspiration = inspiration;
    }
  }

  return createApiResponse({ ...data, linkedInspiration });
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
  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined) updateData.description = description;
  if (scheduled_at !== undefined) updateData.scheduled_at = scheduled_at;
  if (location !== undefined) updateData.location = location;
  if (color !== undefined) updateData.color = color;
  if (status !== undefined) updateData.status = status;
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
