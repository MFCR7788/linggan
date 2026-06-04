// 工作流会话 CRUD API
import { createApiResponse, createApiError, getPaginationParams, createPaginatedResponse } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { ACCOUNT_TYPE_PRESETS } from '@/lib/account-presets';
import { buildHandoffUrl } from '@/hooks/use-content-handoff';

export const dynamic = 'force-dynamic';

// GET  - 列出用户的工作流会话
export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const { page, limit, offset } = getPaginationParams(searchParams);
  const status = searchParams.get('status');

  const supabase = createAdminClient();

  let query = supabase
    .from('workflow_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  } else {
    // 默认不返回 abandoned 和 completed
    query = query.in('status', ['active', 'paused']);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error('获取工作流会话失败:', error);
    return createApiError('获取会话列表失败', 500);
  }

  return createPaginatedResponse(data || [], page, limit, count || 0);
});

// POST - 创建新的工作流会话
export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { combo_id, account_type, title: customTitle } = body;

  if (!combo_id) {
    return createApiError('combo_id 必填', 400);
  }

  // 从预设中查找 combo 定义
  let combo: (typeof ACCOUNT_TYPE_PRESETS)[number]['combos'][number] | undefined;
  let foundAccountType: string | undefined;
  for (const preset of ACCOUNT_TYPE_PRESETS) {
    const found = preset.combos.find((c) => c.id === combo_id);
    if (found) {
      combo = found;
      foundAccountType = preset.id;
      break;
    }
  }

  if (!combo) {
    return createApiError('无效的 combo_id', 400);
  }

  // 初始化 accumulated_handoff（从 prefills）
  const accumulated_handoff: Record<string, string> = {};
  if (combo.prefills) {
    for (const [key, value] of Object.entries(combo.prefills)) {
      if (value) accumulated_handoff[key] = value;
    }
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('workflow_sessions')
    .insert({
      user_id: user.id,
      combo_id,
      account_type: account_type || foundAccountType || null,
      title: customTitle || combo.title,
      total_steps: combo.steps.length,
      accumulated_handoff,
      combo_snapshot: combo as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  if (error) {
    console.error('创建工作流会话失败:', error);
    return createApiError('创建会话失败', 500);
  }

  // 构建第一步 URL
  const firstStep = combo.steps[0];
  const firstStepUrl = buildHandoffUrl(firstStep.entry, accumulated_handoff) +
    '&workflow_session_id=' + data.id;

  return createApiResponse(
    { session: data, firstStepUrl },
    '工作流会话创建成功'
  );
});
