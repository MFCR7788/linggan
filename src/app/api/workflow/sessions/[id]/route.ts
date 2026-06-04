// 单个工作流会话 CRUD
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// GET - 获取会话详情
export const GET = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('workflow_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return createApiError('会话不存在', 404);
    }
    console.error('获取工作流会话失败:', error);
    return createApiError('获取会话失败', 500);
  }

  return createApiResponse(data);
});

// PATCH - 更新会话（推进步骤、暂停/恢复、更新 handoff）
export const PATCH = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const body = await request.json();
  const { current_step_index, status, accumulated_handoff, title } = body;

  const supabase = createAdminClient();

  // 先读当前 session
  const { data: session, error: readErr } = await supabase
    .from('workflow_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (readErr) {
    return createApiError('会话不存在', 404);
  }

  const updates: Record<string, unknown> = {};

  if (title !== undefined) updates.title = title;

  if (current_step_index !== undefined) {
    const idx = Number(current_step_index);
    if (idx < 0 || idx > session.total_steps) {
      return createApiError('无效的步骤索引', 400);
    }
    updates.current_step_index = idx;
    // 自动完成
    if (idx >= session.total_steps) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
    }
  }

  if (status) {
    const validStatuses = ['active', 'paused', 'completed', 'abandoned'];
    if (!validStatuses.includes(status)) {
      return createApiError('无效的 status 值', 400);
    }
    updates.status = status;
    if (status === 'paused') updates.paused_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    if (status === 'active' && session.paused_at) updates.paused_at = null;
  }

  // 深度合并 accumulated_handoff
  if (accumulated_handoff) {
    const merged = { ...(session.accumulated_handoff || {}), ...accumulated_handoff };
    updates.accumulated_handoff = merged;
  }

  const { data, error } = await supabase
    .from('workflow_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('更新工作流会话失败:', error);
    return createApiError('更新会话失败', 500);
  }

  return createApiResponse(data);
});

// DELETE - 放弃会话（软删除）
export const DELETE = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('workflow_sessions')
    .update({ status: 'abandoned' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('删除工作流会话失败:', error);
    return createApiError('删除会话失败', 500);
  }

  return createApiResponse(null, '已放弃');
});
