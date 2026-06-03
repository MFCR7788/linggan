// AI Services - Image Generation (Seedance)

import { DOUBAO_BASE_URL } from './constants';
import type { ImageResult } from './types';

// ====== Prompt 优化（生图/生视频前调用） ======

export async function optimizePrompt(rawPrompt: string, type: 'image' | 'video'): Promise<string> {
  if (!rawPrompt || rawPrompt.length < 5) return rawPrompt;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return rawPrompt;

  const systemPrompt = type === 'image'
    ? `You are an expert AI image prompt engineer. Enhance the given prompt by adding vivid visual details: subject, scene, lighting, colors, style, composition, mood, and atmosphere. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`
    : `You are an expert AI video prompt engineer. Enhance the given prompt by adding details about scene, motion, camera movement, atmosphere, lighting transitions, and temporal progression. Keep it under 200 words. Output ONLY the enhanced prompt in English, no explanations or markdown.`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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

// ====== Seedance Image Generation ======

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

  const apiKey = process.env.DOUBAO_API_KEY;
  const imageModelArkId = process.env.SEEDANCE_IMAGE_MODEL_ARK_ID;

  if (!apiKey) throw new Error('DOUBAO_API_KEY is not configured');
  if (!imageModelArkId) throw new Error('SEEDANCE_IMAGE_MODEL_ARK_ID is not configured');

  const size = getSizeForRatio(options.ratio || '1:1');
  const n = options.n || 1;
  const seed = options.seed;

  const requestBody: Record<string, unknown> = {
    model: imageModelArkId,
    prompt: finalPrompt,
    n,
    size,
  };
  if (typeof seed === 'number' && Number.isFinite(seed) && seed >= 0) {
    requestBody.seed = seed;
    console.log(`[Image] 使用固定种子: ${seed}`);
  }

  const response = await fetch(`${DOUBAO_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Seedance image API error:', response.status, errorText);
    throw new Error(`图片生成失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const results = (data.data || []).map((item: { url: string }) => ({
    imageUrl: item.url,
    prompt: finalPrompt,
    size,
  }));

  return n === 1 ? results[0] : results;
}
