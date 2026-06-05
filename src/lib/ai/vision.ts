// AI Services - Vision API (百炼 Qwen-VL)

import { callQwen } from './chat';
import type { VisionResult } from './types';

function extractTags(text: string): string[] {
  const commonTags = ['AI', '科技', '创意', '设计', '灵感', '创作', '工具', '趋势'];
  return commonTags.filter((tag) => text.includes(tag)).slice(0, 3);
}

export async function callDoubaoVision(
  imageUrl: string,
  prompt: string = '描述这张图片的内容'
): Promise<VisionResult> {
  try {
    const content = await callQwen(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      { temperature: 0.3, model: 'qwen-vl-plus' }
    );

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as VisionResult;
      } catch {
        // fall through to fallback
      }
    }

    return {
      description: content,
      text: '',
      tags: extractTags(content),
    };
  } catch (error) {
    console.error('Doubao vision analysis failed:', error);
    return {
      description: '图片描述（AI分析暂不可用）',
      text: '',
      tags: ['图片', '待分析'],
    };
  }
}
