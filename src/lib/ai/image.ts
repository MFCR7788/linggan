// AI Services - 百炼 wan2.2-image 图片生成

import type { ImageResult } from './types';

// ====== Prompt 优化（生图/生视频前调用） ======

export async function optimizePrompt(rawPrompt: string, type: 'image' | 'video'): Promise<string> {
  if (!rawPrompt || rawPrompt.length < 5) return rawPrompt;

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return rawPrompt;

  const systemPrompt = type === 'image'
    ? `You are an expert AI image prompt engineer. Enhance the given prompt by adding vivid visual details: subject, scene, lighting, colors, style, composition, mood, and atmosphere. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`
    : `You are an expert AI video prompt engineer. Enhance the given prompt by adding details about scene, motion, camera movement, atmosphere, lighting transitions, and temporal progression. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`;

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
