// AI Services - Digital Human (Audio2Video S2V / Animate)

import { DASHSCOPE_VIDEO_BASE, DASHSCOPE_S2V_BASE, HAPPYHORSE_API_KEY } from './constants';
import type { VideoTaskResult, AnimateSubmitResult } from './types';

// ====== 数字人 Audio2Video（wan2.2-s2v） ======

export async function submitDigitalHumanTask(params: {
  imageUrl: string;
  audioUrl: string;
  resolution?: '480P' | '720P';
  mode?: string; // 前端仍可传，但 API 暂不支持，仅保留兼容
}): Promise<VideoTaskResult> {
  const { imageUrl, audioUrl, resolution = '720P' } = params;

  try {
    const response = await fetch(`${DASHSCOPE_S2V_BASE}/services/aigc/image2video/video-synthesis/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HAPPYHORSE_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wan2.2-s2v',
        input: {
          image_url: imageUrl,
          audio_url: audioUrl,
        },
        parameters: {
          resolution,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[DigitalHuman] API 错误:', response.status, errText.substring(0, 500));
      return { taskId: null, status: 'error', message: `数字人服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: '数字人任务已提交' };
  } catch (error) {
    console.error('[DigitalHuman] 提交错误:', error);
    return { taskId: null, status: 'error', message: '网络错误' };
  }
}

export async function getDigitalHumanTaskStatus(
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
      const videoUrl = data.output?.results?.video_url || data.output?.video_url || data.output?.videos?.[0]?.url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }

    if (taskStatus === 'FAILED') {
      return { status: 'failed', message: data.output?.message || data.message || '生成失败' };
    }

    return { status: 'running', message: '生成中...' };
  } catch (error) {
    console.error('[DigitalHuman] 查询错误:', error);
    return { status: 'error', message: '网络错误' };
  }
}

// ====== 数字人 Animate（wan2.2-animate 角色动作迁移） ======
// 静态头像 + 参考视频 → 让静态图"复刻"视频里的动作/表情
// 适合: 创始人 IP 持续产出、虚拟主播预制动作库
// 模型: wan2.2-animate (DashScope 百炼)
// API 端点: 与 s2v 同(POST /api/v1/services/aigc/image2video/video-synthesis/)

export async function submitAnimateTask(params: {
  imageUrl: string;
  videoUrl: string;
  mode?: 'animate' | 'replace'; // animate=动作迁移, replace=角色替换
  resolution?: '480P' | '720P';
}): Promise<AnimateSubmitResult> {
  const { imageUrl, videoUrl, mode = 'animate', resolution = '720P' } = params;

  const apiKey = process.env.HAPPYHORSE_API_KEY;
  if (!apiKey) {
    return { taskId: null, status: 'error', message: 'HAPPYHORSE_API_KEY 未配置' };
  }

  try {
    const response = await fetch(`${DASHSCOPE_S2V_BASE}/services/aigc/image2video/video-synthesis/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wan2.2-animate',
        input: {
          image_url: imageUrl,
          video_url: videoUrl,
          mode, // animate | replace
        },
        parameters: { resolution },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Animate] API 错误:', response.status, errText.substring(0, 500));
      // wan2.2-animate 可能在用户当前账号未开通,返友好错误
      if (errText.includes('ModelNotFound') || errText.includes('not found')) {
        return { taskId: null, status: 'error', message: 'wan2.2-animate 模型未开通,请在阿里云百炼控制台申请' };
      }
      return { taskId: null, status: 'error', message: `Animate 服务错误: ${response.status}` };
    }

    const data = await response.json();
    const taskId = data.output?.task_id;
    if (!taskId) {
      return { taskId: null, status: 'error', message: '未获取到任务ID' };
    }
    return { taskId, status: 'queued', message: 'Animate 任务已提交' };
  } catch (error: unknown) {
    console.error('[Animate] 提交错误:', error);
    return { taskId: null, status: 'error', message: `网络错误: ${error instanceof Error ? error.message : '未知'}` };
  }
}

export async function getAnimateTaskStatus(
  taskId: string
): Promise<{ status: string; videoUrl?: string; message?: string }> {
  try {
    const response = await fetch(`${DASHSCOPE_VIDEO_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${process.env.HAPPYHORSE_API_KEY}` },
    });
    if (!response.ok) return { status: 'error', message: '查询失败' };
    const data = await response.json();
    const taskStatus = data.output?.task_status;
    if (taskStatus === 'SUCCEEDED') {
      const videoUrl = data.output?.results?.video_url || data.output?.video_url || data.output?.videos?.[0]?.url;
      return { status: 'succeeded', videoUrl, message: '生成完成' };
    }
    if (taskStatus === 'FAILED') {
      return { status: 'failed', message: data.output?.message || data.message || '生成失败' };
    }
    return { status: 'running', message: '生成中...' };
  } catch (e) {
    return { status: 'error', message: '网络错误' };
  }
}
