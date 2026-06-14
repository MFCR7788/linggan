// AI Services - Video Generation (百炼 DashScope Wan 系列)

import { optimizePrompt } from './image';
import { DASHSCOPE_VIDEO_BASE, getHappyHorseApiKey, fetchWithTimeout } from './constants';
import { safeErrorText } from './errors';
import { getAgnesApiKey } from '@/lib/runtime-config';
import { QUALITY_TIERS } from './types';
import type { VideoTaskResult, I2VTaskResult } from './types';
import type { VideoProvider, VideoModelConfig } from './types';

// ====== HappyHorse 视频生成（百炼 DashScope） ======

export async function submitVideoTask(
  prompt: string,
  duration: number = 5,
  ratio: string = '16:9'
): Promise<VideoTaskResult> {
  // 先优化提示词
  const finalPrompt = await optimizePrompt(prompt, 'video');
  console.log(`[Video] 优化前: "${prompt.substring(0, 60)}..." → 优化后: "${finalPrompt.substring(0, 60)}..."`);

  try {
    const response = await fetchWithTimeout(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'happyhorse-1.0-t2v',
        input: { prompt: finalPrompt },
        parameters: {
          resolution: '720P',
          ratio,
          duration: Math.min(Math.max(duration, 3), 10),
          watermark: false,
        },
      }),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Video] API 返回错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '任务已提交' };
  } catch (error) {
    console.error('HappyHorse submit task error:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== HappyHorse I2V（图生视频） ======

export async function submitI2VTask(
  imageUrl: string,
  prompt: string,
  duration: number = 10
): Promise<I2VTaskResult> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  console.log(`[I2V] 图生视频: "${finalPrompt.substring(0, 60)}..."`);

  try {
    const response = await fetchWithTimeout(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'happyhorse-1.0-i2v',
        input: {
          prompt: finalPrompt,
          media: [{ type: 'first_frame', url: imageUrl }],
        },
        parameters: {
          resolution: '720P',
          duration: Math.min(Math.max(duration, 3), 10),
          watermark: false,
        },
      }),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[I2V] API 返回错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `图生视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '图生视频任务已提交' };
  } catch (error) {
    console.error('HappyHorse I2V submit task error:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

export async function getVideoTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  try {
    const response = await fetchWithTimeout(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${getHappyHorseApiKey()}` },
    }, 10000);

    if (!response.ok) {
      return { status: 'error', message: '查询失败' };
    }

    const data = await response.json();
    const taskStatus = data.output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      const videoUrl = data.output?.video_url || data.output?.videos?.[0]?.url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (taskStatus === 'FAILED') {
      return { status: 'failed', message: data.output?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('HappyHorse query task error:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 通用 DashScope 视频提交（HappyHorse + Wan 2.6） ======

async function submitDashScopeVideoTask(
  config: VideoModelConfig,
  prompt: string,
  duration: number = 5,
  imageUrl?: string,
  lastFrameUrl?: string
): Promise<{ taskId: string | null; status: string; message: string }> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  const isWan = config.model.includes('wan');

  const input: Record<string, unknown> = { prompt: finalPrompt };
  if (imageUrl) {
    if (isWan) {
      // Wan: img_url 是首帧, last_frame_url 是尾帧
      input.img_url = imageUrl;
      if (lastFrameUrl) input.last_frame_url = lastFrameUrl;
    } else {
      // DashScope 通用: media 数组支持 first_frame / last_frame
      const media: Array<{ type: string; url: string }> = [{ type: 'first_frame', url: imageUrl }];
      if (lastFrameUrl) media.push({ type: 'last_frame', url: lastFrameUrl });
      input.media = media;
    }
  }

  const parameters: Record<string, unknown> = {
    duration: Math.min(Math.max(duration, 3), 10),
    watermark: false,
  };

  if (isWan && config.size) {
    parameters.size = config.size;
    if (config.extraParams) Object.assign(parameters, config.extraParams);
  } else {
    parameters.resolution = config.resolution || '720P';
    parameters.ratio = '16:9';
  }

  try {
    const response = await fetchWithTimeout(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getHappyHorseApiKey()}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({ model: config.model, input, parameters }),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[DashScope:${config.model}] API 错误:`, response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `视频服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '任务已提交' };
  } catch (error) {
    console.error(`[DashScope:${config.model}] 提交错误:`, error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== 通用视频生成入口（百炼 DashScope Wan 系列） ======

export async function submitVideoGenerationTask(
  tier: string,
  prompt: string,
  duration: number = 5,
  imageUrl?: string,
  lastFrameUrl?: string,
  extraFrameUrls?: string[],
  mode?: 'i2v' | 'multi'
): Promise<VideoTaskResult & { model: string; provider: VideoProvider }> {
  const qt = QUALITY_TIERS[tier] || QUALITY_TIERS['fast'];
  let config: VideoModelConfig;
  if (mode === 'multi' && qt.multiImageI2v) {
    config = qt.multiImageI2v;
  } else {
    config = imageUrl ? qt.i2v : qt.t2v;
  }

  const result = await submitDashScopeVideoTask(config, prompt, duration, imageUrl, lastFrameUrl);

  return { ...result, model: config.model, provider: config.provider };
}

export async function getVideoTaskStatusUniversal(
  taskId: string,
  _provider: VideoProvider
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  return getVideoTaskStatus(taskId);
}

export async function generateVideo(prompt: string, duration: number = 5) {
  const result = await submitVideoTask(prompt, duration);
  if (result.taskId) {
    return { videoUrl: null, prompt, duration, taskId: result.taskId, status: 'queued' };
  }
  return { videoUrl: null, prompt, duration, status: 'error', message: result.message || '视频任务提交失败，请稍后重试' };
}

// ====== Agnes AI 视频生成 ======

const AGNES_VIDEO_BASE = 'https://apihub.agnes-ai.com/v1/video/generations';

/** 视频比例 → [width, height] */
const VIDEO_SIZE_MAP: Record<string, { landscape: string; portrait: string }> = {
  '16:9': { landscape: '1920x1080', portrait: '1080x1920' },
  '9:16': { landscape: '1920x1080', portrait: '1080x1920' },
  '1:1': { landscape: '1080x1080', portrait: '1080x1080' },
};

export interface AgnesVideoOptions {
  /** 视频时长（秒），默认 5，最长 20 */
  duration?: number;
  /** 分辨率: 720p (1280x768) / 1080p (1920x1080)，默认 720p */
  resolution?: '720p' | '1080p';
  /** 视频比例: 16:9 / 9:16 / 1:1，默认 16:9 */
  ratio?: string;
  /** 首帧图片 URL，用于图生视频 (I2V) */
  imageUrl?: string;
}

const MAX_DURATION = 20;
const MIN_DURATION = 3;

export interface AgnesVideoResult {
  taskId: string;
  videoUrl?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  model: string;
  message?: string;
  size?: string;
  seconds?: number;
}

export async function submitAgnesVideoTask(
  prompt: string,
  options: AgnesVideoOptions = {}
): Promise<AgnesVideoResult> {
  const apiKey = getAgnesApiKey();
  if (!apiKey) throw new Error('AGNES_API_KEY is not configured');

  const duration = Math.min(Math.max(options.duration || 5, MIN_DURATION), MAX_DURATION);
  const ratio = options.ratio || '16:9';
  const sizeEntry = VIDEO_SIZE_MAP[ratio] || VIDEO_SIZE_MAP['16:9'];
  const size = options.resolution === '1080p' ? sizeEntry.landscape : '1280x768';

  const body: Record<string, unknown> = {
    model: 'agnes-video-v2.0',
    prompt,
    seconds: String(duration),
    size,
  };

  // 图生视频：传入首帧图片
  if (options.imageUrl) {
    body.image_url = options.imageUrl;
  }

  try {
    const res = await fetchWithTimeout(AGNES_VIDEO_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }, 30000);

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Agnes 视频提交失败 (${res.status}): ${err.substring(0, 300)}`);
    }

    const data = await res.json();
    const taskId = data.id || data.task_id;
    if (!taskId) throw new Error('Agnes 视频提交失败: 未获取到任务 ID');

    return {
      taskId,
      status: 'queued',
      model: 'agnes-video-v2.0',
      size,
      seconds: duration,
      message: data.message,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Agnes')) throw e;
    throw new Error(`Agnes 视频提交网络错误: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getAgnesVideoTaskStatus(taskId: string): Promise<AgnesVideoResult> {
  const apiKey = getAgnesApiKey();
  if (!apiKey) throw new Error('AGNES_API_KEY is not configured');

  try {
    const res = await fetchWithTimeout(`${AGNES_VIDEO_BASE}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);

    if (!res.ok) {
      return { taskId, status: 'running', model: 'agnes-video-v2.0', message: '查询中...' };
    }

    const response = await res.json();
    const inner = response.data || response;
    const platformStatus = inner.status;
    const videoData = inner.data;

    if (platformStatus === 'SUCCESS' || videoData?.status === 'succeeded') {
      const videoUrl = videoData?.url || videoData?.video_url;
      return { taskId, status: 'succeeded', videoUrl, model: 'agnes-video-v2.0' };
    }

    if (platformStatus === 'FAILED' || videoData?.status === 'failed') {
      return {
        taskId, status: 'failed', model: 'agnes-video-v2.0',
        message: inner.fail_reason || videoData?.error || '生成失败',
      };
    }

    return { taskId, status: 'running', model: 'agnes-video-v2.0', message: '生成中...' };
  } catch {
    return { taskId, status: 'running', model: 'agnes-video-v2.0', message: '查询中...' };
  }
}
