// AI 任务队列 (V2.0.1)
// 把 ai_tasks 表从"日志表"升级为"真任务队列"
// worker 通过 /api/jobs/claim 抢占执行
// 进度通过 updateProgress 上报
// 失败通过 markFailed 上报（带自动重试逻辑）

import { createAdminClient } from '../supabase-server';
import type { AiTask, AiTaskType, AiTaskStatus, BatchProgress } from '@/types';

// 并发控制（按任务类型）
export const CONCURRENCY_LIMITS: Record<AiTaskType, number> = {
  ai_summary: 10,
  copywriting: 5,
  image: 10,
  image_batch: 10,           // 批量生图
  video: 5,
  digital_human: 3,
  digital_human_batch: 3,
  video_merge: 5,
};

// 任务类型 → 预估秒数（前端 ETA 计算）
export const ESTIMATED_SECONDS: Record<AiTaskType, number> = {
  ai_summary: 5,
  copywriting: 8,
  image: 12,
  image_batch: 12,
  video: 60,
  digital_human: 90,
  digital_human_batch: 90,
  video_merge: 30,
};

// 抢占超时：worker 抢占后多少秒没上报进度视为卡死
export const CLAIM_TIMEOUT_SECONDS = 180;

// ─── 提交批量任务 ──────────────────────────────────────────

export interface EnqueueBatchItem {
  prompt: string;
  params: Record<string, any>;
  inspirationId?: string;
  contentId?: string;
}

export interface EnqueueBatchInput {
  userId: string;
  taskType: AiTaskType;
  items: EnqueueBatchItem[];
  priority?: number;       // 1-10
  estimatedSeconds?: number;
}

export interface EnqueueBatchResult {
  batchId: string;
  taskIds: string[];
  total: number;
}

/**
 * 提交一批任务到 ai_tasks 队列
 * - 同一批次共享 batchId
 * - 全部初始 status='pending',scheduled_for=now()
 * - 返回 batchId 和 taskIds，前端用 batchId 查进度
 */
export async function enqueueBatch(input: EnqueueBatchInput): Promise<EnqueueBatchResult> {
  if (input.items.length === 0) {
    throw new Error('enqueueBatch: items 不能为空');
  }
  if (input.items.length > 50) {
    throw new Error('enqueueBatch: 单批最多 50 个任务');
  }

  const supabase = createAdminClient();
  const batchId = crypto.randomUUID();
  const estimatedSeconds = input.estimatedSeconds ?? ESTIMATED_SECONDS[input.taskType];
  const priority = input.priority ?? 5;

  const rows = input.items.map((item) => ({
    user_id: input.userId,
    task_type: input.taskType,
    status: 'pending' as const,
    batch_id: batchId,
    input: { prompt: item.prompt, params: item.params, inspirationId: item.inspirationId, contentId: item.contentId },
    progress: 0,
    priority,
    scheduled_for: new Date().toISOString(),
    retry_count: 0,
    max_retries: 3,
    estimated_seconds: estimatedSeconds,
  }));

  const { data, error } = await supabase
    .from('ai_tasks')
    .insert(rows)
    .select('id');

  if (error) {
    console.error('[enqueueBatch] 插入失败:', error);
    throw new Error(`enqueueBatch failed: ${error.message}`);
  }

  const taskIds = (data || []).map((r) => r.id);
  console.log(`[enqueueBatch] 提交 ${taskIds.length} 个任务, batchId=${batchId}`);

  return { batchId, taskIds, total: taskIds.length };
}

// ─── 抢占任务 ──────────────────────────────────────────────

export interface ClaimOptions {
  workerId: string;
  taskType?: AiTaskType;       // 不传则抢占所有类型
  limit?: number;              // 默认 5
}

/**
 * Worker 抢占一批待执行任务
 * 流程：
 *   1) 找 status='pending' AND scheduled_for<=now() AND 按 priority ASC, scheduled_for ASC
 *   2) 用 update + status='processing', worker_id, started_at 实现原子抢占
 *   3) 同时回收超时（started_at + claim_timeout 秒 且仍在 processing 且无 progress 更新）的任务
 */
export async function claimNext(opts: ClaimOptions): Promise<AiTask[]> {
  const supabase = createAdminClient();
  const limit = opts.limit ?? 5;
  const claimTimeoutIso = new Date(Date.now() - CLAIM_TIMEOUT_SECONDS * 1000).toISOString();

  // 1) 回收超时任务（status='processing' AND started_at<claimTimeoutIso）
  const { error: reclaimError } = await supabase
    .from('ai_tasks')
    .update({
      status: 'pending',
      worker_id: null,
      started_at: null,
    })
    .eq('status', 'processing')
    .lt('started_at', claimTimeoutIso);

  if (reclaimError) {
    console.warn('[claimNext] 回收超时任务失败:', reclaimError.message);
  }

  // 2) 抢占新任务
  let query = supabase
    .from('ai_tasks')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (opts.taskType) {
    query = query.eq('task_type', opts.taskType);
  }

  const { data: candidates, error } = await query;
  if (error || !candidates || candidates.length === 0) {
    if (error) console.error('[claimNext] 查询失败:', error);
    return [];
  }

  // 3) 原子更新（用 in 一次更新所有候选）
  const ids = candidates.map((c) => c.id);
  const now = new Date().toISOString();
  const { data: claimed, error: updateError } = await supabase
    .from('ai_tasks')
    .update({
      status: 'processing',
      worker_id: opts.workerId,
      started_at: now,
    })
    .in('id', ids)
    .eq('status', 'pending')   // CAS：只在 pending 时才更新
    .select('*');

  if (updateError) {
    console.error('[claimNext] 抢占失败:', updateError);
    return [];
  }

  console.log(`[claimNext] worker=${opts.workerId} 抢占 ${claimed?.length || 0}/${ids.length} 个任务`);
  return (claimed as AiTask[]) || [];
}

// ─── 上报进度 ──────────────────────────────────────────────

export async function updateProgress(taskId: string, progress: number, workerId?: string): Promise<void> {
  if (progress < 0 || progress > 100) {
    throw new Error(`updateProgress: progress 必须在 0-100, 收到 ${progress}`);
  }
  const supabase = createAdminClient();
  const update: Record<string, any> = { progress };
  if (workerId) update.worker_id = workerId;
  const { error } = await supabase
    .from('ai_tasks')
    .update(update)
    .eq('id', taskId);
  if (error) console.error(`[updateProgress] ${taskId} 失败:`, error.message);
}

// ─── 标记完成 ──────────────────────────────────────────────

export async function markCompleted(taskId: string, output: any): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('ai_tasks')
    .update({
      status: 'completed',
      progress: 100,
      output,
      completed_at: new Date().toISOString(),
      worker_id: null,
    })
    .eq('id', taskId);
  if (error) {
    console.error(`[markCompleted] ${taskId} 失败:`, error.message);
    throw error;
  }
  console.log(`[markCompleted] ${taskId} 完成`);
}

// ─── 标记失败 + 自动重试 ──────────────────────────────────

export interface MarkFailedInput {
  taskId: string;
  errorCode: string;
  errorMessage: string;
  canRetry?: boolean;        // 默认 true（除非明确告知不可重试）
}

export interface MarkFailedResult {
  status: 'failed' | 'pending';  // pending = 已重试
  retryCount: number;
}

export async function markFailed(input: MarkFailedInput): Promise<MarkFailedResult> {
  const supabase = createAdminClient();
  const canRetry = input.canRetry !== false;

  // 先取当前 retry_count
  const { data: task, error: getError } = await supabase
    .from('ai_tasks')
    .select('retry_count, max_retries')
    .eq('id', input.taskId)
    .single();

  if (getError || !task) {
    console.error(`[markFailed] ${input.taskId} 查询失败:`, getError?.message);
    throw getError || new Error('任务不存在');
  }

  const nextRetry = (task.retry_count || 0) + 1;
  const willRetry = canRetry && nextRetry <= (task.max_retries || 3);

  if (willRetry) {
    // 指数退避：30s, 2min, 8min
    const delays = [30, 120, 480];
    const delaySec = delays[Math.min(nextRetry - 1, delays.length - 1)];
    const scheduledFor = new Date(Date.now() + delaySec * 1000).toISOString();

    const { error } = await supabase
      .from('ai_tasks')
      .update({
        status: 'pending',
        retry_count: nextRetry,
        scheduled_for: scheduledFor,
        worker_id: null,
        started_at: null,
        error_code: input.errorCode,
        error_message: input.errorMessage,
      })
      .eq('id', input.taskId);

    if (error) {
      console.error(`[markFailed] ${input.taskId} 重试调度失败:`, error.message);
      throw error;
    }
    console.log(`[markFailed] ${input.taskId} 失败但将重试 (${nextRetry}/${task.max_retries}), ${delaySec}s 后`);
    return { status: 'pending', retryCount: nextRetry };
  } else {
    const { error } = await supabase
      .from('ai_tasks')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        worker_id: null,
        error_code: input.errorCode,
        error_message: input.errorMessage,
      })
      .eq('id', input.taskId);

    if (error) {
      console.error(`[markFailed] ${input.taskId} 永久失败状态写入失败:`, error.message);
      throw error;
    }
    console.log(`[markFailed] ${input.taskId} 永久失败 (重试 ${nextRetry - 1}/${task.max_retries})`);
    return { status: 'failed', retryCount: nextRetry - 1 };
  }
}

// ─── 取消任务 ──────────────────────────────────────────────

export async function cancelTask(taskId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('ai_tasks')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      worker_id: null,
    })
    .eq('id', taskId)
    .in('status', ['pending', 'processing']);
  if (error) {
    console.error(`[cancelTask] ${taskId} 失败:`, error.message);
    throw error;
  }
}

// ─── 取消整批任务 ──────────────────────────────────────────

export async function cancelBatch(batchId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ai_tasks')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      worker_id: null,
    })
    .eq('batch_id', batchId)
    .in('status', ['pending', 'processing'])
    .select('id');

  if (error) {
    console.error(`[cancelBatch] ${batchId} 失败:`, error.message);
    throw error;
  }
  console.log(`[cancelBatch] ${batchId} 取消 ${data?.length || 0} 个任务`);
  return data?.length || 0;
}

// ─── 查批次进度（前端用） ──────────────────────────────────

export async function getBatchProgress(batchId: string): Promise<BatchProgress | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ai_tasks')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[getBatchProgress] ${batchId} 失败:`, error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const total = data.length;
  const counts: Record<AiTaskStatus, number> = {
    pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0,
  };
  let progressSum = 0;
  let totalEstimatedRemaining = 0;

  for (const t of data) {
    const s = t.status as AiTaskStatus;
    if (s in counts) counts[s]++;
    progressSum += (t.progress || 0);
    if (s === 'processing' && t.estimated_seconds) {
      const remaining = Math.round(t.estimated_seconds * (1 - (t.progress || 0) / 100));
      totalEstimatedRemaining += remaining;
    } else if (s === 'pending' && t.estimated_seconds) {
      totalEstimatedRemaining += t.estimated_seconds;
    }
  }

  const finished = counts.completed + counts.failed + counts.cancelled;
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0;

  return {
    batchId,
    total,
    pending: counts.pending,
    processing: counts.processing,
    completed: counts.completed,
    failed: counts.failed,
    cancelled: counts.cancelled,
    percent,
    estimatedRemainingSeconds: totalEstimatedRemaining > 0 ? totalEstimatedRemaining : undefined,
    tasks: data as AiTask[],
  };
}
