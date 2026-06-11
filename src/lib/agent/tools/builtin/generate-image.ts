import type { ToolDefinition } from '../../types';
import { generateImage } from '@/lib/ai-services';

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description: '根据文字描述生成图片（文生图）。当用户要求画图、生成图片、做海报、做封面、设计图、生成照片、画一个/张/幅等时调用。这是唯一的图片生成工具。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片描述（中文即可，会自动优化为英文 prompt）' },
      ratio: { type: 'string', description: '图片比例: 1:1, 16:9, 9:16（默认 1:1）' },
    },
    required: ['prompt'],
  },
  async handler(params, _ctx) {
    const prompt = params.prompt as string;
    const ratio = (params.ratio as string) || '1:1';
    try {
      const result = await generateImage(prompt, { ratio: ratio as '1:1' | '16:9' | '9:16' });
      const images = Array.isArray(result) ? result : [result];
      const urls = images.map((img) => img.imageUrl).filter(Boolean);
      if (urls.length === 0) {
        return { success: false, output: '图片生成失败，未返回图片 URL。' };
      }
      return {
        success: true,
        output: `已生成 ${urls.length} 张图片：\n${urls.map((u, i) => `![图片${i + 1}](${u})`).join('\n')}`,
        data: { imageUrls: urls, prompt },
      };
    } catch (e) {
      return { success: false, output: '', error: `图片生成失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
