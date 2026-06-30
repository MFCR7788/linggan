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

  // 先拉取全部匹配（不分页），用于应用层复合排序
  const { data: allData, error, count } = await query
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('获取日程失败:', error);
    return createApiError('获取日程失败', 500);
  }

  // ─── 苹果日历风格排序 ──────────────────────────────
  // 1. 状态优先级: pending → completed → cancelled
  // 2. pending 内: 未过期（即将发生）→ 已过期
  // 3. 未过期: 升序（最近的先）; 已过期: 降序（最近过期的先）
  // 4. completed/cancelled: 降序（最近完成的先）
  const sorted = [...(allData || [])].sort((a, b) => {
    const statusOrder: Record<string, number> = { pending: 0, completed: 1, cancelled: 2 };
    const statusDiff = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
    if (statusDiff !== 0) return statusDiff;

    const now = Date.now();
    const aTime = new Date(a.scheduled_at).getTime();
    const bTime = new Date(b.scheduled_at).getTime();

    if (a.status === 'pending') {
      const aPast = aTime < now;
      const bPast = bTime < now;
      if (!aPast && bPast) return -1; // a 即将发生, b 已过期 → a 在前
      if (aPast && !bPast) return 1;  // a 已过期, b 即将发生 → b 在前
      if (!aPast && !bPast) return aTime - bTime; // 都即将: 升序
      return bTime - aTime;                         // 都已过期: 降序
    }

    // completed / cancelled: 最近完成的排前面
    return bTime - aTime;
  });

  // 内存分页
  const total = sorted.length;
  const paged = sorted.slice(offset, offset + limit);
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    success: true,
    data: paged,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
    },
  });
});

// 创建日程
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { title, description, scheduled_at, location, color, remind_before, suggestions, source_content_id } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return createApiError('日程标题不能为空', 400);
  }
  if (title.trim().length > 100) {
    return createApiError('日程标题不能超过100个字符', 400);
  }
  if (!scheduled_at) {
    return createApiError('日程时间不能为空', 400);
  }
  // 校验 ISO 8601 日期格式
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return createApiError('日程时间格式无效，需要 ISO 8601 格式', 400);
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
      suggestions: Array.isArray(suggestions) ? JSON.stringify(suggestions) : null,
      source_content_id: source_content_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error('创建日程失败:', error);
    return createApiError('创建日程失败', 500);
  }

  // 如果关联了灵感，更新灵感生命周期 + last_action_at
  if (source_content_id) {
    supabase
      .from('content_items')
      .update({ lifecycle: 'sprout', last_action_at: new Date().toISOString() })
      .eq('id', source_content_id)
      .eq('user_id', user.id)
      .then(({ error: updateErr }) => {
        if (updateErr) console.warn('[Schedule] 更新灵感生命周期失败:', updateErr);
      });
  }

  return createApiResponse(data, '日程创建成功');
});
