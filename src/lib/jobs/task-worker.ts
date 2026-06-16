// 通用任务 worker (V2.0.1)
// 由 /api/jobs/claim 端点调用
// 流程：claimNext → 按 taskType 派发 → 调 worker → mark completed/failed

import { claimNext, markCompleted, markFailed, type ClaimOptions } from './queue';
import { processImageTask } from './workers/image';
import { processDigitalHumanTask } from './workers/digital-human';
import type { AiTask, AiTaskType } from '@/types';
import { summarizeContent, generateCopywriting } from '@/lib/ai/content';
import { submitVideoTask } from '@/lib/ai/video';
import { logAiUsage } from '@/lib/ai/usage';

// Worker 注册表：每个 taskType 对应一个处理函数
type WorkerHandler = (task: AiTask, workerId: string) => Promise<any>;

/** AI 摘要任务处理器 */
async function processSummaryTask(task: AiTask, _workerId: string) {
  const input = task.input as { content?: string; contentType?: string };
  if (!input?.content) throw Object.assign(new Error('缺少 content'), { code: 'INVALID_INPUT' });
  const result = await summarizeContent(input.content, input.contentType || 'text');
  if (task.user_id) {
    logAiUsage(task.user_id, 'ai_summary', 0).catch(() => {});
  }
  return result;
}

/** AI 文案任务处理器 */
async function processCopywritingTask(task: AiTask, _workerId: string) {
  const input = task.input as {
    inspirations?: Array<{ title?: string; originalText?: string; aiSummary?: string }>;
    type?: string;
    style?: string;
    noAiTaste?: boolean;
    variantCount?: number;
    industryInstruction?: string;
    userInstruction?: string;
  };
  const result = await generateCopywriting(
    input?.inspirations || [],
    input?.type || 'text',
    input?.style || '通用',
    input?.noAiTaste ?? false,
    input?.variantCount || 1,
    input?.industryInstruction,
    input?.userInstruction,
  );
  if (task.user_id) {
    logAiUsage(task.user_id, 'copywriting', 0).catch(() => {});
  }
  return result;
}

/** 视频生成任务处理器 */
async function processVideoTask(task: AiTask, _workerId: string) {
  const input = task.input as { prompt?: string; duration?: number };
  if (!input?.prompt) throw Object.assign(new Error('缺少 prompt'), { code: 'INVALID_INPUT' });
  const result = await submitVideoTask(input.prompt, input.duration || 5);
  if (task.user_id) {
    logAiUsage(task.user_id, 'video', 0).catch(() => {});
  }
  return result;
}

/** 视频合并任务处理器（服务端 ffmpeg） */
async function processVideoMergeTask(task: AiTask, _workerId: string) {
  const input = task.input as { segmentUrls?: string[]; bgmUrl?: string; subtitles?: string };
  if (!input?.segmentUrls?.length) throw Object.assign(new Error('缺少 segmentUrls'), { code: 'INVALID_INPUT' });
  // 视频合并由 /api/ai/video/merge 端点处理，此处作为异步队列入口
  // worker 返回 merge 参数，实际合并在 merge route 执行
  return { segmentUrls: input.segmentUrls, bgmUrl: input.bgmUrl, subtitles: input.subtitles, merged: false, note: '合并任务需调用 /api/ai/video/merge 完成' };
}

async function processVideoMixTask(task: AiTask): Promise<Record<string, unknown>> {
  // 视频混剪任务：返回混剪参数，实际执行在 API route 或后台 worker
  const input = task.input as Record<string, unknown>;
  return { project: input.project, status: 'queued', note: '混剪任务已入队' };
}

const WORKER_REGISTRY: Partial<Record<AiTaskType, WorkerHandler>> = {
  ai_summary: processSummaryTask,
  copywriting: processCopywritingTask,
  image: processImageTask,
  image_batch: processImageTask,
  video: processVideoTask,
  video_merge: processVideoMergeTask,
  video_mix: processVideoMixTask,
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
 * - 默认每轮 claim 5 个（与 cron 1 分钟频率匹配）
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
    } catch (e: unknown) {
      const errorCode = (e as { code?: string })?.code || 'WORKER_ERROR';
      const errorMessage = e instanceof Error ? e.message : String(e);
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
