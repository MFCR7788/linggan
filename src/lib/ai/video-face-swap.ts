// 视频换人 — 阿里云百炼 wan2.2-animate-mix
// 原视频场景/运镜/产品不变，仅替换出镜人物
// 异步 API：提交 → 轮询 → 获取结果

import { fetchWithTimeout, getDashScopeApiKey } from './constants';

const DASHSCOPE_VIDEO_BASE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis';
const DASHSCOPE_TASK_BASE = 'https://dashscope.aliyuncs.com/api/v1/tasks';

export interface VideoFaceSwapOptions {
  /** 新人物照片 URL（正面清晰、五官可见） */
  imageUrl: string;
  /** 原视频 URL（2-30秒，≤200MB，MP4/AVI/MOV） */
  videoUrl: string;
  /** wan-std（标准，快/省）或 wan-pro（专业，高质量） */
  mode?: 'wan-std' | 'wan-pro';
  /** 是否跳过图片内容审核，默认 false */
  skipCheck?: boolean;
}

export interface VideoFaceSwapResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  taskId?: string;
  duration?: number;
  mode?: string;
}

function getApiKey(): string {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');
  return apiKey;
}

export async function swapVideoFace(options: VideoFaceSwapOptions): Promise<VideoFaceSwapResult> {
  const apiKey = getApiKey();
  const mode = options.mode || 'wan-std';

  const taskId = await submitFaceSwapTask({ imageUrl: options.imageUrl, videoUrl: options.videoUrl, mode, skipCheck: options.skipCheck });
  const videoUrl = await pollFaceSwapTask(taskId);
  if (!videoUrl) throw new Error('视频换人超时（任务可能仍在处理中）');

  return { success: true, videoUrl, taskId, mode };
}

// ── 批量换人（多段视频并行提交+轮询） ──

interface SegmentSwapInput {
  index: number;
  imageUrl: string;
  videoUrl: string;
  mode: 'wan-std' | 'wan-pro';
  skipCheck?: boolean;
}

interface SegmentSwapResult {
  index: number;
  success: boolean;
  videoUrl?: string;
  error?: string;
  taskId?: string;
}

/** 批量换人：并行提交全部任务 → 并行轮询全部结果 */
export async function batchSwapVideoFace(segments: SegmentSwapInput[]): Promise<SegmentSwapResult[]> {
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    const s = segments[0];
    try {
      const result = await swapVideoFace({ imageUrl: s.imageUrl, videoUrl: s.videoUrl, mode: s.mode, skipCheck: s.skipCheck });
      return [{ index: s.index, success: true, videoUrl: result.videoUrl, taskId: result.taskId }];
    } catch (e) {
      return [{ index: s.index, success: false, error: e instanceof Error ? e.message : String(e) }];
    }
  }

  const apiKey = getApiKey();

  // Step 1: 并行提交全部任务
  const submissions = await Promise.all(
    segments.map(async (seg, idx) => {
      try {
        const taskId = await submitFaceSwapTask({
          imageUrl: seg.imageUrl,
          videoUrl: seg.videoUrl,
          mode: seg.mode,
          skipCheck: seg.skipCheck,
        });
        return { index: idx, taskId, success: true };
      } catch (e) {
        return { index: idx, taskId: null, success: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  // Step 2: 并行轮询全部已提交的任务
  const pollResults = await Promise.all(
    submissions.map(async (sub) => {
      if (!sub.success || !sub.taskId) {
        return { index: sub.index, success: false, error: sub.error || '提交失败' };
      }
      try {
        const videoUrl = await pollFaceSwapTask(sub.taskId);
        if (!videoUrl) throw new Error('轮询超时');
        return { index: sub.index, success: true, videoUrl, taskId: sub.taskId };
      } catch (e) {
        return { index: sub.index, success: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  return pollResults;
}

// ── 底层：提交 / 轮询 ──

interface SubmitInput {
  imageUrl: string;
  videoUrl: string;
  mode: 'wan-std' | 'wan-pro';
  skipCheck?: boolean;
}

async function submitFaceSwapTask(input: SubmitInput): Promise<string> {
  const apiKey = getApiKey();

  const submitBody = {
    model: 'wan2.2-animate-mix',
    input: {
      image_url: input.imageUrl,
      video_url: input.videoUrl,
    },
    parameters: {
      mode: input.mode,
      ...(input.skipCheck ? { check_image: false } : {}),
    },
  };

  const submitRes = await fetchWithTimeout(DASHSCOPE_VIDEO_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitBody),
  }, 30000);

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`视频换人提交失败 (${submitRes.status}): ${errText.substring(0, 300)}`);
  }

  const submitData = await submitRes.json();
  if (submitData.code) {
    throw new Error(submitData.message || `视频换人 API 错误: ${submitData.code}`);
  }

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('视频换人失败: 未获取到 task_id');
  return taskId;
}

async function pollFaceSwapTask(taskId: string): Promise<string | null> {
  const apiKey = getApiKey();

  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s 间隔

    const res = await fetchWithTimeout(`${DASHSCOPE_TASK_BASE}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);

    if (!res.ok) continue;

    const data = await res.json();

    switch (data.output?.task_status) {
      case 'SUCCEEDED':
        return data.output?.results?.video_url || null;
      case 'FAILED':
        console.error('视频换人任务失败:', data.output?.message);
        throw new Error(data.output?.message || '视频换人生成失败');
      case 'CANCELED':
        throw new Error('视频换人任务被取消');
      case 'PENDING':
      case 'RUNNING':
        continue;
    }
  }
  return null;
}
