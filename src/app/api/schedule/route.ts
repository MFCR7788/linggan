import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 列出用户的日程
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = (page - 1) * limit;
  const status = searchParams.get('status');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  const supabase = createAdminClient();
  let query = supabase
    .from('schedules')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id);

  if (status) {
    query = query.eq('status', status);
  }
  if (startDate) {
    query = query.gte('scheduled_at', startDate);
  }
  if (endDate) {
    query = query.lte('scheduled_at', endDate);
  }

  const { data, error, count } = await query
    .order('scheduled_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('获取日程失败:', error);
    return createApiError('获取日程失败', 500);
  }

  const totalPages = Math.ceil((count || 0) / limit);
  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: totalPages,
    },
  });
});

// 创建日程
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { title, description, scheduled_at, location, color, remind_before, source_content_id } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return createApiError('日程标题不能为空', 400);
  }
  if (!scheduled_at) {
    return createApiError('日程时间不能为空', 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('schedules')
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description || null,
      scheduled_at,
      location: location || null,
      color: color || '#3B82F6',
      remind_before: remind_before != null ? remind_before : 30,
      source_content_id: source_content_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error('创建日程失败:', error);
    return createApiError('创建日程失败', 500);
  }

  return createApiResponse(data, '日程创建成功');
});
