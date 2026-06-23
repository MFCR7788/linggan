// 提示词反馈持久化 — 保存用户评价并更新聚合指标 + 触发双流记忆

import { createAdminClient } from '@/lib/supabase-server';
import { tacticalMemory } from './evolution/tactical-memory';
import { strategicMemory } from './evolution/strategic-memory';

export interface PromptFeedbackRecord {
  userId: string;
  sessionId?: string;
  messageId?: string;
  originalPrompt: string;
  optimizedPrompt?: string;
  frameworkUsed?: string;
  optimizationConfidence?: number;
  rating: 1 | -1;
  feedbackTags?: string[];
  comment?: string;
  toolCallsUsed?: string[];
  responseSnippet?: string;
}

export async function savePromptFeedback(record: PromptFeedbackRecord): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('prompt_feedback')
    .insert({
      user_id: record.userId,
      session_id: record.sessionId || null,
      message_id: record.messageId || null,
      original_prompt: record.originalPrompt,
      optimized_prompt: record.optimizedPrompt || null,
      framework_used: record.frameworkUsed || null,
      optimization_confidence: record.optimizationConfidence ?? null,
      rating: record.rating,
      feedback_tags: record.feedbackTags || null,
      comment: record.comment || null,
      tool_calls_used: record.toolCallsUsed || null,
      response_snippet: record.responseSnippet?.substring(0, 500) || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[PromptFeedback] save failed:', error);
    return null;
  }

  if (record.frameworkUsed) {
    updateFrameworkMetrics(record.frameworkUsed, record.rating, record.feedbackTags).catch((e) =>
      console.warn('[PromptFeedback] metrics update failed:', e),
    );

    // 战术记忆：会话内即时学习
    if (record.sessionId) {
      tacticalMemory.record(
        record.sessionId,
        record.frameworkUsed,
        record.rating,
        record.originalPrompt,
      );
    }

    // 战略记忆：跨会话长期学习
    strategicMemory.recordFeedback(
      record.userId,
      record.frameworkUsed,
      record.frameworkUsed,
      record.rating,
    ).catch((e) => console.warn('[PromptFeedback] strategic memory update failed:', e));
  }

  return data?.id ?? null;
}

async function updateFrameworkMetrics(
  frameworkId: string,
  rating: 1 | -1,
  tags?: string[],
): Promise<void> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('prompt_optimization_metrics')
    .select('*')
    .eq('framework_id', frameworkId)
    .is('industry', null)
    .is('task_type', null)
    .maybeSingle();

  if (existing) {
    const pos = (existing.positive_feedback as number) + (rating === 1 ? 1 : 0);
    const neg = (existing.negative_feedback as number) + (rating === -1 ? 1 : 0);
    const total = (existing.total_feedback as number) + 1;
    await supabase
      .from('prompt_optimization_metrics')
      .update({
        total_feedback: total,
        positive_feedback: pos,
        negative_feedback: neg,
        success_rate: total > 0 ? pos / total : 0.5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('prompt_optimization_metrics').insert({
      framework_id: frameworkId,
      framework_name: frameworkId,
      total_feedback: 1,
      positive_feedback: rating === 1 ? 1 : 0,
      negative_feedback: rating === -1 ? 1 : 0,
      success_rate: rating === 1 ? 1.0 : 0.0,
      top_feedback_tags: tags || [],
    });
  }
}

/** 获取框架成功率排行（供优化器使用） */
export async function getFrameworkSuccessRates(): Promise<
  Array<{ frameworkId: string; successRate: number; totalFeedback: number }>
> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('prompt_optimization_metrics')
    .select('framework_id, success_rate, total_feedback')
    .order('success_rate', { ascending: false })
    .limit(50);

  return (data || []).map((r: Record<string, unknown>) => ({
    frameworkId: r.framework_id as string,
    successRate: r.success_rate as number,
    totalFeedback: r.total_feedback as number,
  }));
}
