// 视频换人 — 阿里云百炼 wan2.2-animate-mix
// 原视频场景/运镜/产品不变，仅替换出镜人物
// 异步 API：提交 → 轮询 → 获取结果

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

export async function swapVideoFace(options: VideoFaceSwapOptions): Promise<VideoFaceSwapResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const mode = options.mode || 'wan-std';

  // Step 1: 提交异步任务
  const submitBody = {
    model: 'wan2.2-animate-mix',
    input: {
      image_url: options.imageUrl,
      video_url: options.videoUrl,
    },
    parameters: {
      mode,
      ...(options.skipCheck ? { check_image: false } : {}),
    },
  };

  const submitRes = await fetch(DASHSCOPE_VIDEO_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitBody),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`视频换人提交失败 (${submitRes.status}): ${errText.substring(0, 300)}`);
  }

  const submitData = await submitRes.json();

  // 检查是否有错误
  if (submitData.code) {
    throw new Error(submitData.message || `视频换人 API 错误: ${submitData.code}`);
  }

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('视频换人失败: 未获取到 task_id');

  // Step 2: 轮询结果（最长 8 分钟）
  const videoUrl = await pollSwapTask(apiKey, taskId);
  if (!videoUrl) throw new Error('视频换人超时（任务可能仍在处理中）');

  return { success: true, videoUrl, taskId, mode };
}

async function pollSwapTask(apiKey: string, taskId: string): Promise<string | null> {
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s 间隔

    const res = await fetch(`${DASHSCOPE_TASK_BASE}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

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
        continue; // 继续等待
    }
  }
  return null;
}
