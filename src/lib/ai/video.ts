// AI Services - Video Generation (DashScope / Seedance)

import { optimizePrompt } from './image';
import { DASHSCOPE_VIDEO_BASE, DOUBAO_BASE_URL, HAPPYHORSE_API_KEY, SEEDANCE_SERVICE_TIER, SEEDANCE_SUPPORTS_FLEX } from './constants';
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

// ====== Seedance 视频提交（ARK） ======

/**
 * Seedance 离线推理档位(`service_tier`):
 * - flex: 5 折,延迟小时级,适合非实时批量任务(降本首选)
 * - default: 全价,延迟分钟级,适合即时预览
 *
 * 默认 flex。可通过 env `SEEDANCE_SERVICE_TIER=default` 切回快速档。
 * 适用范围:Seedance 1.x 全系(1.0-pro / 1.0-pro-fast / 1.0-lite / 1.5-pro);
 *          Seedance 2.0 不支持 flex,代码会自动回退到 default。
 */

async function submitSeedanceTask(
  config: VideoModelConfig,
  prompt: string,
  duration: number = 5,
  imageUrl?: string,
  lastFrameUrl?: string,
  extraFrameUrls?: string[]
): Promise<{ taskId: string | null; status: string; message: string }> {
  const finalPrompt = await optimizePrompt(prompt, 'video');
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) return { taskId: null, status: 'error', message: 'DOUBAO_API_KEY 未配置' };

  const content: Record<string, unknown>[] = [
    { type: 'text', text: finalPrompt },
  ];
  if (imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
      role: 'first_frame',
    });
  }
  if (lastFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: lastFrameUrl },
      role: 'last_frame',
    });
  }
  // 中间关键帧（参考帧）
  if (extraFrameUrls && extraFrameUrls.length > 0) {
    for (const url of extraFrameUrls) {
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      });
    }
  }

  // Seedance 2.0 不支持 flex,自动回退到 default
  const tier = SEEDANCE_SUPPORTS_FLEX(config.model) ? SEEDANCE_SERVICE_TIER : 'default';

  try {
    const response = await fetch(`${DOUBAO_BASE_URL}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        content,
        resolution: config.resolution || '720p',
        ratio: '16:9',
        duration: Math.min(Math.max(duration, 4), 15),
        watermark: false,
        service_tier: tier,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Seedance:${config.model}] API 错误:`, response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `Seedance 服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: tier === 'flex' ? '任务已提交(离线推理,5 折)' : '任务已提交' };
  } catch (error) {
    console.error(`[Seedance:${config.model}] 提交错误:`, error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

// ====== Seedance 任务状态查询 ======

async function getSeedanceTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) return { status: 'error', message: 'DOUBAO_API_KEY 未配置' };

  try {
    const response = await fetch(`${DOUBAO_BASE_URL}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return { status: 'error', message: '查询失败' };
    }

    const data = await response.json();

    if (data.status === 'succeeded') {
      const videoUrl = data.content?.video_url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (data.status === 'failed') {
      return { status: 'failed', message: data.error?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('Seedance query task error:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 通用视频生成入口 ======

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
  // multi 模式: 首帧 + 尾帧 + 中间关键帧,优先用 multiImageI2v 配置
  let config: VideoModelConfig;
  if (mode === 'multi' && qt.multiImageI2v) {
    config = qt.multiImageI2v;
  } else {
    config = imageUrl ? qt.i2v : qt.t2v;
  }

  let result: VideoTaskResult;
  if (config.provider === 'ark') {
    result = await submitSeedanceTask(config, prompt, duration, imageUrl, lastFrameUrl, extraFrameUrls);
  } else {
    result = await submitDashScopeVideoTask(config, prompt, duration, imageUrl, lastFrameUrl);
  }

  return { ...result, model: config.model, provider: config.provider };
}

export async function getVideoTaskStatusUniversal(
  taskId: string,
  provider: VideoProvider
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  if (provider === 'ark') {
    return getSeedanceTaskStatus(taskId);
  }
  return getVideoTaskStatus(taskId);
}

export async function generateVideo(prompt: string, duration: number = 5) {
  const result = await submitVideoTask(prompt, duration);
  if (result.taskId) {
    return { videoUrl: null, prompt, duration, taskId: result.taskId, status: 'queued' };
  }
  return { videoUrl: `https://picsum.photos/seed/${Date.now()}/800/600`, prompt, duration };
}
