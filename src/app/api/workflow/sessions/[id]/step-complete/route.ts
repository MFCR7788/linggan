// 步骤完成 — 原子操作：记录步骤结果 + 合并 handoff + 推进 step
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { buildHandoffUrl } from '@/lib/handoff-url';
import { StepResult } from '@/types';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth(async ({ request, user, params }) => {
  const { id } = params;
  const body = await request.json();
  const { outputContentId, handoffData } = body;

  const supabase = createAdminClient();

  // 读取当前 session
  const { data: session, error: readErr } = await supabase
    .from('workflow_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (readErr) {
    return createApiError('会话不存在', 404);
  }

  if (session.status !== 'active') {
    return createApiError(`会话状态为 ${session.status}，无法继续`, 409);
  }

  // 追记 step_result
  const stepResult: StepResult = {
    index: session.current_step_index,
    completedAt: new Date().toISOString(),
    outputContentId: outputContentId || undefined,
  };
  const stepResults = [...(session.step_results || []), stepResult];

  // 合并 accumulated_handoff
  const mergedHandoff = { ...(session.accumulated_handoff || {}) };
  if (handoffData && typeof handoffData === 'object') {
    for (const [key, value] of Object.entries(handoffData)) {
      if (value) mergedHandoff[key] = String(value);
    }
  }

  const nextStepIndex = session.current_step_index + 1;
  const isLastStep = nextStepIndex >= session.total_steps;

  const updates: Record<string, unknown> = {
    step_results: stepResults,
    accumulated_handoff: mergedHandoff,
    current_step_index: nextStepIndex,
  };

  if (isLastStep) {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('workflow_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('完成步骤失败:', error);
    return createApiError('更新会话失败', 500);
  }

  // 构建下一步 URL
  let nextStepUrl: string | null = null;

  if (!isLastStep) {
    const comboSnapshot = data.combo_snapshot as Record<string, unknown> | undefined;
    const steps = (comboSnapshot?.steps as Array<{ entry: string }>) || [];
    const nextStep = steps[nextStepIndex];

    if (nextStep?.entry) {
      const base = buildHandoffUrl(nextStep.entry, mergedHandoff);
      nextStepUrl = `${base}${base.includes('?') ? '&' : '?'}workflow_session_id=${data.id}`;
    }
  }

  return createApiResponse(
    {
      session: data,
      nextStepUrl,
      isComplete: isLastStep,
    },
    isLastStep ? '全部步骤已完成' : '步骤已完成'
  );
});
