// AI Services - Video Generation (百炼 DashScope Wan 系列)

import { optimizePrompt } from './image';
import { DASHSCOPE_VIDEO_BASE, HAPPYHORSE_API_KEY } from './constants';
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
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
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
    });

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
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
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
    });

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
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${HAPPYHORSE_API_KEY}` },
    });

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
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({ model: config.model, input, parameters }),
    });

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
  return { videoUrl: `https://picsum.photos/seed/${Date.now()}/800/600`, prompt, duration };
}
