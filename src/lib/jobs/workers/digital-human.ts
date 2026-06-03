// 数字人任务 worker
// 处理 ai_tasks.task_type = 'digital_human' | 'digital_human_batch'
// 调 submitDigitalHumanTask → 轮询 → 拿到结果后写 content_items + logAiUsage

import { createAdminClient } from '@/lib/supabase-server';
import { logAiUsage, submitDigitalHumanTask, getDigitalHumanTaskStatus } from '@/lib/ai-services';
import { updateProgress } from '../queue';
import type { AiTask } from '@/types';

interface DigitalHumanParams {
  imageUrl: string;
  audioUrl?: string;
  script?: string;
  voice?: string;
  inspirationId?: string;
}

export async function processDigitalHumanTask(task: AiTask): Promise<unknown> {
  const params = task.input as DigitalHumanParams;
  if (!params?.imageUrl) {
    throw new Error('imageUrl 必填');
  }
  if (!params?.audioUrl) {
    throw new Error('audioUrl 必填');
  }

  // 1) 调豆包数字人接口(注意: 实际接口只接 imageUrl + audioUrl)
  const submitResult = await submitDigitalHumanTask({
    imageUrl: params.imageUrl,
    audioUrl: params.audioUrl,
  });

  const externalTaskId = submitResult.taskId || (submitResult as Record<string, unknown>).task_id as string;
  if (!externalTaskId) {
    throw new Error('数字人提交失败:未返回 task_id');
  }

  // 2) 轮询(每 5 秒一次,最多 5 分钟)
  const maxAttempts = 60;
  const intervalMs = 5000;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const status = await getDigitalHumanTaskStatus(externalTaskId);
    if (status.status === 'succeeded' && status.videoUrl) {
      // 写 content_items + 计费
      await onDigitalHumanCompleted(task, { videoUrl: status.videoUrl, taskId: externalTaskId });
      return { videoUrl: status.videoUrl, taskId: externalTaskId };
    }
    if (status.status === 'failed' || status.status === 'error') {
      throw new Error(status.message || '数字人生成失败');
    }
    // 进度上报(0-90,留 100 给完成时)
    const progress = Math.min(90, Math.floor(((i + 1) / maxAttempts) * 90));
    if ((i + 1) % 6 === 0) {
      // 每 30 秒上报一次进度
      await updateProgress(task.id, progress);
    }
  }
  throw new Error('数字人超时(5 分钟未完成)');
}

/**
 * 完成回调:写 content_items + 记 AI 用量
 */
export async function onDigitalHumanCompleted(task: AiTask, output: Record<string, unknown> | null): Promise<void> {
  if (!output?.videoUrl) return;
  const supabase = createAdminClient();
  const params = task.input as DigitalHumanParams;

  // 写 content_items
  await supabase
    .from('content_items')
    .insert({
      user_id: task.user_id,
      type: 'video',
      title: params.script?.substring(0, 50) || '数字人视频',
      description: params.script,
      media_urls: [output.videoUrl],
      thumbnail_url: output.videoUrl,
      source_platform: 'ai',
      tags: ['数字人'],
      metadata: { digital_human_task_id: output.taskId },
    });

  // 计费(单条)
  try {
    await logAiUsage(task.user_id, 'digital_human', 1);
  } catch (e: unknown) {
    console.warn('[digital-human worker] logAiUsage 失败:', e instanceof Error ? e.message : String(e));
  }
}
