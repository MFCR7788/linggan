// 通用任务 worker (V2.0.1)
// 由 /api/jobs/claim 端点调用
// 流程：claimNext → 按 taskType 派发 → 调 worker → mark completed/failed

import { claimNext, markCompleted, markFailed, type ClaimOptions } from './queue';
import { processImageTask } from './workers/image';
import { processDigitalHumanTask, onDigitalHumanCompleted } from './workers/digital-human';
import type { AiTask, AiTaskType } from '@/types';

// Worker 注册表：每个 taskType 对应一个处理函数
type WorkerHandler = (task: AiTask, workerId: string) => Promise<any>;

const WORKER_REGISTRY: Partial<Record<AiTaskType, WorkerHandler>> = {
  image: processImageTask,
  image_batch: processImageTask,
  digital_human: processDigitalHumanTask,
  digital_human_batch: processDigitalHumanTask,
};

export interface RunWorkerResult {
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  details: Array<{
    taskId: string;
    taskType: string;
    status: 'completed' | 'failed';
    errorCode?: string;
    errorMessage?: string;
  }>;
}

/**
 * 跑一轮 worker：claim 一批任务，逐个执行
 * - 默认每轮 claim 5 个（与 Vercel cron 1 分钟频率匹配）
 * - 任务级并发控制：每个 taskType 独立计数
 */
export async function runWorker(opts: { workerId: string; limit?: number }): Promise<RunWorkerResult> {
  const claimed = await claimNext({ workerId: opts.workerId, limit: opts.limit ?? 5 });

  const result: RunWorkerResult = {
    workerId: opts.workerId,
    claimed: claimed.length,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  if (claimed.length === 0) {
    return result;
  }

  for (const task of claimed) {
    const handler = WORKER_REGISTRY[task.task_type as AiTaskType];
    if (!handler) {
      console.warn(`[runWorker] 未注册的 taskType: ${task.task_type}, taskId=${task.id}`);
      await markFailed({
        taskId: task.id,
        errorCode: 'NO_HANDLER',
        errorMessage: `没有处理 ${task.task_type} 的 worker`,
        canRetry: false,
      });
      result.failed++;
      result.details.push({
        taskId: task.id,
        taskType: task.task_type,
        status: 'failed',
        errorCode: 'NO_HANDLER',
        errorMessage: `没有处理 ${task.task_type} 的 worker`,
      });
      continue;
    }

    try {
      const output = await handler(task, opts.workerId);
      await markCompleted(task.id, output);
      result.succeeded++;
      result.details.push({ taskId: task.id, taskType: task.task_type, status: 'completed' });
    } catch (e: any) {
      const errorCode = e?.code || 'WORKER_ERROR';
      const errorMessage = e?.message || String(e);
      console.error(`[runWorker] task ${task.id} 失败:`, errorCode, errorMessage);
      await markFailed({
        taskId: task.id,
        errorCode,
        errorMessage,
        canRetry: !['INVALID_INPUT', 'NO_HANDLER'].includes(errorCode),
      });
      result.failed++;
      result.details.push({
        taskId: task.id,
        taskType: task.task_type,
        status: 'failed',
        errorCode,
        errorMessage,
      });
    }
  }

  return result;
}
