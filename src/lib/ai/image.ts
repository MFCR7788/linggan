// AI Services - 百炼 wan2.2-image 图片生成

import type { ImageResult } from './types';

// ====== Prompt 优化（生图/生视频前调用） ======

export async function optimizePrompt(rawPrompt: string, type: 'image' | 'video'): Promise<string> {
  if (!rawPrompt || rawPrompt.length < 5) return rawPrompt;

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return rawPrompt;

  const systemPrompt = type === 'image'
    ? `You are an expert AI image prompt engineer for the wanx2.1-t2i-turbo model. This model excels at: photorealism, Chinese ink painting, illustration, and detailed scene rendering. It understands both Chinese and English prompts.

Enhance the given prompt by adding:
- Subject: main object/person, appearance, pose, expression
- Composition: shot type (close-up/medium/wide), angle, framing
- Lighting: direction, quality (soft/hard), time of day
- Colors: palette, saturation, contrast
- Atmosphere: mood, environment, weather
- Style: art style, rendering technique, reference aesthetics

Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`
    : `You are an expert AI video prompt engineer for the wan2.6 video model. This model excels at: cinematic visuals, dynamic camera movement (dolly, pan, tilt, zoom, tracking), smooth lighting transitions, and temporal storytelling. It supports start/end frame guidance.

Enhance the given prompt by adding:
- Scene description: setting, subjects, atmosphere
- Motion: subject movement, object dynamics, flow
- Camera: movement type (push/pull/pan/tilt/tracking/static), speed, rhythm
- Lighting: changes over time, transitions, mood shifts
- Timing: pace suggestions, key moment beats

Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`;

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Enhance this prompt for AI ${type} generation:\n\n${rawPrompt}` },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      console.warn('Prompt optimization API error:', response.status);
      return rawPrompt;
    }

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim();
    if (!enhanced) return rawPrompt;

    return enhanced.replace(/^["']|["']$/g, '').trim();
  } catch (e) {
    console.warn('Prompt optimization failed, using original:', e);
    return rawPrompt;
  }
}

// ====== 百炼 wan2.2-image 图片生成 ======

function getSizeForRatio(ratio: string): string {
  const minPixels = 1920 * 1920;
  switch (ratio) {
    case '1:1':
      return '1920x1920';
    case '16:9':
      return '2560x1440';
    case '9:16':
      return '1440x2560';
    case '4:3':
      return '2216x1662';
    case '3:4':
      return '1662x2216';
    default:
      return '1920x1920';
  }
}

export async function generateImage(
  prompt: string,
  options: { ratio?: string; n?: number; seed?: number } = {}
): Promise<ImageResult | ImageResult[]> {
  // 先优化提示词
  const finalPrompt = await optimizePrompt(prompt, 'image');
  console.log(`[Image] 优化前: "${prompt.substring(0, 60)}..." → 优化后: "${finalPrompt.substring(0, 60)}..."`);

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not configured');

  const size = getSizeForRatio(options.ratio || '1:1');
  const n = options.n || 1;
  const seed = options.seed;

  // 百炼 wan2.2-image 使用 width*height 格式
  const [w, h] = size.split('x');
  const dashScopeSize = `${w}*${h}`;

  const requestBody: Record<string, unknown> = {
    model: 'wanx2.1-t2i-turbo',
    input: { prompt: finalPrompt },
    parameters: { size: dashScopeSize, n },
  };
  if (typeof seed === 'number' && Number.isFinite(seed) && seed >= 0) {
    (requestBody.parameters as Record<string, unknown>).seed = seed;
    console.log(`[Image] 使用固定种子: ${seed}`);
  }

  // 提交异步任务
  const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    console.error('wanx2.1-t2i-turbo API error:', submitRes.status, errorText);
    throw new Error(`图片生成失败: ${submitRes.status} ${errorText}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('图片生成失败: 未获取到任务 ID');

  // 轮询结果
  const imageUrl = await pollImageTask(apiKey, taskId);
  if (!imageUrl) throw new Error('图片生成超时');

  const result: ImageResult = { imageUrl, prompt: finalPrompt, size };
  return result;
}

async function pollImageTask(apiKey: string, taskId: string): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (data.output?.task_status === 'SUCCEEDED') {
      return data.output?.results?.[0]?.url || null;
    }
    if (data.output?.task_status === 'FAILED') {
      console.error('图片生成任务失败:', data.output?.message);
      throw new Error(data.output?.message || '图片生成失败');
    }
  }
  return null;
}

// ====== Agnes AI 图片生成 ======

const AGNES_IMAGE_BASE = 'https://apihub.agnes-ai.com/v1/images';

/** 质量档位 → 1:1 基准分辨率，实际按比例缩放 */
type ImageQuality = 'standard' | 'hd' | '4k';

const QUALITY_BASE: Record<ImageQuality, number> = {
  standard: 1024,
  hd: 1920,
  '4k': 3840,
};

/** 比例 → [width, height] 乘数 */
const RATIO_MAP: Record<string, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
};

function calcAgnesSize(ratio: string, quality: ImageQuality): string {
  const base = QUALITY_BASE[quality] || QUALITY_BASE.standard;
  const [rw, rh] = RATIO_MAP[ratio] || RATIO_MAP['1:1'];
  const diag = Math.sqrt(rw * rw + rh * rh);
  const w = Math.round((base * rw) / diag);
  const h = Math.round((base * rh) / diag);
  return `${w}x${h}`;
}

export interface AgnesImageOptions {
  /** 图片比例，默认 1:1 */
  ratio?: string;
  /** 生成张数，默认 1 */
  n?: number;
  /** 质量档位: standard(1024) / hd(1920) / 4k(3840)，默认 standard */
  quality?: ImageQuality;
}

export async function generateImageAgnes(
  prompt: string,
  options: AgnesImageOptions = {}
): Promise<ImageResult> {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) throw new Error('AGNES_API_KEY is not configured');

  const size = calcAgnesSize(options.ratio || '1:1', options.quality || 'standard');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${AGNES_IMAGE_BASE}/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'agnes-image-2.1-flash',
        prompt,
        n: options.n || 1,
        size,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Agnes 图片生成失败 (${res.status}): ${err.substring(0, 300)}`);
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error('Agnes 图片生成失败: 未返回图片 URL');

    return { imageUrl: url, prompt, size };
  } finally {
    clearTimeout(timer);
  }
}

// ====== Agnes AI 图片编辑 ======

export type EditOperation = 'enhance' | 'remove_bg' | 'style_transfer' | 'inpaint' | 'expand';

const EDIT_PROMPTS: Record<EditOperation, string> = {
  enhance: '增强画质，提升清晰度和色彩，保持原图内容不变',
  remove_bg: '移除背景，替换为纯白色背景，保持主体完整清晰',
  style_transfer: '转换风格',
  inpaint: '修复和填充',
  expand: '智能扩展画面，向外延伸画面内容，保持构图和谐',
};

export interface AgnesEditOptions {
  /** 图片 URL 或 base64 */
  image: string;
  /** 编辑操作 */
  operation: EditOperation;
  /** 额外 prompt（style_transfer 需要目标风格描述） */
  prompt?: string;
  /** 遮罩图片 URL（inpaint 需要） */
  mask?: string;
}

export async function editImageAgnes(options: AgnesEditOptions): Promise<ImageResult> {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) throw new Error('AGNES_API_KEY is not configured');

  const basePrompt = EDIT_PROMPTS[options.operation];
  const fullPrompt = [basePrompt, options.prompt].filter(Boolean).join('。');

  const body: Record<string, unknown> = {
    model: 'agnes-image-2.1-flash',
    image: options.image,
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
  };

  if (options.mask) body.mask = options.mask;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${AGNES_IMAGE_BASE}/edits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Agnes 图片编辑失败 (${res.status}): ${err.substring(0, 300)}`);
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error('Agnes 图片编辑失败: 未返回图片 URL');

    return { imageUrl: url, prompt: fullPrompt, size: '1024x1024' };
  } finally {
    clearTimeout(timer);
  }
}
