// Seedance 2.0 视频生成 — 火山引擎 Ark API
// 模式: 文生视频 / 图生视频-首帧 / 图生视频-首尾帧

import { fetchWithTimeout } from './constants';
import { getArkApiKey } from '@/lib/runtime-config';

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const TASKS_PATH = '/contents/generations/tasks';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 480_000; // 8 分钟

export type SeedanceResolution = '480p' | '720p' | '1080p';
export type SeedanceRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive';

export interface SeedanceContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
  role?: 'first_frame' | 'last_frame' | 'reference_image';
}

export interface SeedanceParams {
  prompt: string;
  /** 首帧图片 URL（图生视频） */
  imageUrl?: string;
  /** 尾帧图片 URL（首尾帧生视频） */
  lastFrameUrl?: string;
  duration?: number;       // 4-15 秒，默认 5
  resolution?: SeedanceResolution; // 默认 720p
  ratio?: SeedanceRatio;   // 默认 adaptive
  generateAudio?: boolean; // 默认 false（后续用 TTS 配音）
  seed?: number;           // -1 随机
  priority?: number;       // 0-9，越大越高
  model?: string;          // 默认 doubao-seedance-2-0-260128
}

export interface SeedanceTaskResult {
  taskId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  message?: string;
  model: string;
}

function buildModel(model?: string): string {
  return model || 'doubao-seedance-2-0-260128';
}

/** 提交 Seedance 视频生成任务 */
export async function submitSeedanceTask(params: SeedanceParams): Promise<SeedanceTaskResult> {
  const apiKey = getArkApiKey();
  if (!apiKey) throw new Error('ARK_API_KEY is not configured');

  const model = buildModel(params.model);
  const isFast = model.includes('fast');

  const content: SeedanceContentItem[] = [];

  // 图生视频：首帧 + 参考图（同一张图双角色，保证产品外观一致）
  if (params.imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: params.imageUrl },
      role: 'first_frame',
    });
    // 同时作为 reference_image 锁定产品外观，防止画面漂移
    content.push({
      type: 'image_url',
      image_url: { url: params.imageUrl },
      role: 'reference_image',
    });
  }

  // 首尾帧：尾帧
  if (params.lastFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: params.lastFrameUrl },
      role: 'last_frame',
    });
  }

  // 文本 prompt
  if (params.prompt) {
    content.push({ type: 'text', text: params.prompt });
  }

  const body: Record<string, unknown> = {
    model,
    content,
    duration: Math.min(Math.max(params.duration || 5, 4), 15),
    ratio: params.ratio || '9:16',
    resolution: isFast && params.resolution === '1080p' ? '720p' : (params.resolution || '720p'),
    watermark: false,
    generate_audio: params.generateAudio ?? false,
    return_last_frame: false,
  };

  if (params.seed !== undefined) body.seed = params.seed;
  if (params.priority !== undefined) body.priority = Math.min(Math.max(params.priority, 0), 9);

  try {
    const response = await fetchWithTimeout(`${ARK_BASE}${TASKS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[Seedance] API 错误 ${response.status}:`, errText.substring(0, 500));
      return {
        taskId: '',
        status: 'failed',
        message: `Seedance 提交失败 (${response.status}): ${errText.substring(0, 200)}`,
        model,
      };
    }

    const data = await response.json();
    const taskId = data.id || data.task_id;
    if (!taskId) {
      return {
        taskId: '',
        status: 'failed',
        message: '未获取到任务 ID',
        model,
      };
    }

    return { taskId, status: 'queued', model, message: '任务已提交' };
  } catch (error) {
    console.error('[Seedance] 提交异常:', error);
    return {
      taskId: '',
      status: 'failed',
      message: `网络错误: ${error instanceof Error ? error.message : String(error)}`,
      model,
    };
  }
}

/** 查询 Seedance 任务状态 */
export async function getSeedanceTaskStatus(taskId: string): Promise<SeedanceTaskResult> {
  const apiKey = getArkApiKey();
  if (!apiKey) throw new Error('ARK_API_KEY is not configured');

  try {
    const response = await fetchWithTimeout(`${ARK_BASE}${TASKS_PATH}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);

    if (!response.ok) {
      return { taskId, status: 'running', model: '', message: '查询中...' };
    }

    const data = await response.json();
    const status: string = data.status;

    if (status === 'succeeded') {
      // 视频 URL 可能在 content.video_url 或 data.video_url
      const videoUrl = data.content?.video_url || data.video_url || data.output?.video_url;
      return { taskId, status: 'succeeded', videoUrl, model: data.model || '' };
    }

    if (status === 'failed') {
      return {
        taskId,
        status: 'failed',
        model: data.model || '',
        message: data.error?.message || data.error || '生成失败',
      };
    }

    return { taskId, status: 'running', model: data.model || '', message: '生成中...' };
  } catch {
    return { taskId, status: 'running', model: '', message: '查询中...' };
  }
}

/** 轮询等待 Seedance 任务完成 */
export async function pollSeedanceTask(
  taskId: string,
  timeoutMs: number = POLL_TIMEOUT_MS
): Promise<SeedanceTaskResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    await sleep(POLL_INTERVAL_MS);

    const result = await getSeedanceTaskStatus(taskId);

    if (result.status === 'succeeded' || result.status === 'failed') {
      return result;
    }
  }

  return {
    taskId,
    status: 'failed',
    message: 'Seedance 任务超时，请稍后重试',
    model: '',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
