// Image Worker (V2.0.1)
// 处理 ai_tasks 中 task_type='image' 或 'image_batch' 的任务
// 调用豆包 Seedance API → 写 content_items → 返回 output

import { createAdminClient } from '../../supabase-server';
import { generateImage, logAiUsage } from '../../ai-services';
import { updateProgress } from '../queue';
import type { AiTask } from '@/types';

export interface ImageWorkerInput {
  prompt: string;
  params: {
    ratio?: string;
    seed?: number;
    presetId?: string;
    style?: string;
    paletteId?: string;
    n?: number;
  };
  inspirationId?: string;
  contentId?: string;
  saveToInspiration?: boolean;  // 是否写入灵感库（默认 true）
  source?: string;              // batch_image / single_image / ads_grid
}

export interface ImageWorkerOutput {
  imageUrl: string;
  imageUrls?: string[];        // 批量时多个
  prompt: string;
  size: string;
  taskId: string;
}

export async function processImageTask(task: AiTask, workerId: string): Promise<ImageWorkerOutput> {
  const input = task.input as unknown as ImageWorkerInput;
  if (!input?.prompt) {
    throw Object.assign(new Error('任务缺少 prompt'), { code: 'INVALID_INPUT' });
  }

  // 1) 上报进度 10%
  await updateProgress(task.id, 10, workerId);

  // 2) 调用豆包生图
  const n = input.params?.n || 1;
  const result = await generateImage(input.prompt, {
    ratio: input.params?.ratio,
    seed: input.params?.seed,
    n,
  });

  // 3) 上报进度 80%
  await updateProgress(task.id, 80, workerId);

  const isBatch = Array.isArray(result);
  const firstResult = isBatch ? (result as any[])[0] : (result as any);
  const imageUrls: string[] = isBatch
    ? (result as any[]).map((r) => r.imageUrl).filter(Boolean)
    : [(result as any).imageUrl].filter(Boolean);

  if (imageUrls.length === 0) {
    throw Object.assign(new Error('生成结果为空'), { code: 'EMPTY_RESULT' });
  }

  // 4) 写 content_items（如果 saveToInspiration 不为 false）
  if (input.saveToInspiration !== false) {
    try {
      const supabase = createAdminClient();
      await supabase.from('content_items').insert({
        user_id: task.user_id,
        type: 'image',
        title: input.prompt.substring(0, 50),
        original_text: input.prompt,
        source_url: imageUrls[0],
        source_platform: 'ai',
        media_urls: imageUrls,
        thumbnail_url: imageUrls[0],
        lifecycle_status: 'draft',
        analysis_status: 'pending',
        status: 'active',
        is_shared: false,
        category_id: null,
      });
    } catch (e: any) {
      // 写灵感库失败不阻塞任务完成（图片本身已生成）
      console.warn(`[image worker] 写灵感库失败: ${e.message}`);
    }
  }

  // 5) 记录 AI 用量
  try {
    await logAiUsage(task.user_id, 'image', 100 * imageUrls.length);
  } catch (e: any) {
    console.warn(`[image worker] logAiUsage 失败: ${e.message}`);
  }

  // 6) 上报进度 100%
  await updateProgress(task.id, 100, workerId);

  return {
    imageUrl: imageUrls[0],
    imageUrls: isBatch ? imageUrls : undefined,
    prompt: input.prompt,
    size: firstResult?.size || '',
    taskId: task.id,
  };
}
