// Agnes Video V2.0 API — 图+文字 → 口播视频（原生口型同步+配音）
// 用于换人复刻：照片 + 口播文案 → 新人物口播视频

import { fetchWithTimeout } from './constants';
import { getAgnesApiKey } from '@/lib/runtime-config';

const AGNES_VIDEO_BASE = 'https://apihub.agnes-ai.com/v1/videos';

export interface AgnesVideoOptions {
  /** 人物照片 URL（必填） */
  imageUrl: string;
  /** 口播文案（必填） */
  prompt: string;
  /** 帧数，默认 161（8n+1，≤441）。161帧@24fps≈6.7秒 */
  numFrames?: number;
  /** 帧率，默认 24 */
  frameRate?: number;
  /** 分辨率宽度，默认 1152 */
  width?: number;
  /** 分辨率高度，默认 768 */
  height?: number;
  /** 随机种子 */
  seed?: number;
  /** 负面提示 */
  negativePrompt?: string;
}

export interface AgnesVideoResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  taskId?: string;
  duration?: string;
}

/** 有效帧数列表 */
const VALID_FRAMES = new Set([81, 121, 161, 201, 241, 281, 321, 361, 401, 441]);

function clampFrames(n: number): number {
  // 找到 ≥ n 的最小有效值，超出则取最大
  for (const v of VALID_FRAMES) {
    if (v >= n) return v;
  }
  return 441;
}

export async function generateAgnesVideo(options: AgnesVideoOptions): Promise<AgnesVideoResult> {
  const apiKey = getAgnesApiKey();
  if (!apiKey) throw new Error('AGNES_API_KEY is not configured');

  const numFrames = clampFrames(options.numFrames || 161);
  const frameRate = options.frameRate || 24;
  const width = options.width || 1152;
  const height = options.height || 768;

  const body: Record<string, unknown> = {
    model: 'agnes-video-v2.0',
    prompt: options.prompt,
    image: options.imageUrl,
    mode: 'keyframes',
    width,
    height,
    num_frames: numFrames,
    frame_rate: frameRate,
  };

  if (options.seed != null) body.seed = options.seed;
  if (options.negativePrompt) body.negative_prompt = options.negativePrompt;

  // Step 1: 创建任务
  const createRes = await fetchWithTimeout(AGNES_VIDEO_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '');
    throw new Error(`Agnes Video 创建失败 (${createRes.status}): ${err.substring(0, 300)}`);
  }

  const createData = await createRes.json();
  const taskId = createData.task_id || createData.id;
  if (!taskId) throw new Error('Agnes Video 创建失败: 未获取到 task_id');

  // Step 2: 轮询结果（最长 5 分钟）
  const videoUrl = await pollAgnesVideoTask(apiKey, taskId);
  if (!videoUrl) throw new Error('Agnes Video 生成超时');

  return {
    success: true,
    videoUrl,
    taskId,
    duration: createData.seconds,
  };
}

async function pollAgnesVideoTask(apiKey: string, taskId: string): Promise<string | null> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const res = await fetchWithTimeout(`${AGNES_VIDEO_BASE}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 10000);

    if (!res.ok) continue;

    const data = await res.json();

    if (data.status === 'completed') {
      return data.remixed_from_video_id || data.video_url || data.url || null;
    }

    if (data.status === 'failed') {
      console.error('Agnes Video 任务失败:', data.error);
      throw new Error(data.error || 'Agnes Video 生成失败');
    }
  }
  return null;
}
