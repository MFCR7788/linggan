import type { ToolDefinition } from '../../types';
import { generateImageAgnes } from '@/lib/ai/image';
import { generateImage } from '@/lib/ai-services';

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description: `根据文字描述生成图片（文生图），使用 Agnes Image 2.1 Flash 模型。
当用户要求画图、生成图片、做海报、做封面、设计图、生成照片、画一个/张/幅等时调用。

质量档位(quality):
- standard: 1024px，生成快速（默认推荐）
- hd: 1920px，高画质
- 4k: 3840px，超高清（生成较慢，约 30-60 秒）

比例(ratio): 1:1（默认）, 16:9, 9:16, 4:3, 3:4`,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '图片描述。中文即可，模型原生支持中文，无需翻译。描述越详细效果越好，可包含：主体、场景、风格、光影、色彩、构图等。',
      },
      ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], description: '图片比例，默认 1:1' },
      quality: { type: 'string', enum: ['standard', 'hd', '4k'], description: '质量档位，默认 standard' },
    },
    required: ['prompt'],
  },
  async handler(params, _ctx) {
    const prompt = params.prompt as string;
    const ratio = (params.ratio as string) || '1:1';
    const quality = ((params.quality as string) || 'standard') as 'standard' | 'hd' | '4k';
    try {
      let result;
      try {
        result = await generateImageAgnes(prompt, {
          ratio: ratio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
          quality,
        });
      } catch (agnesErr) {
        console.warn('[generate_image] Agnes 失败，降级 DashScope:', agnesErr);
        const dashResult = await generateImage(prompt, { ratio: ratio as '1:1' | '16:9' | '9:16' });
        result = dashResult;
      }
      const images = Array.isArray(result) ? result : [result];
      const urls = images.map((img) => img.imageUrl).filter(Boolean);
      if (urls.length === 0) {
        return { success: false, output: '图片生成失败，未返回图片 URL。' };
      }
      return {
        success: true,
        output: `已生成 ${urls.length} 张图片：\n${urls.map((u, i) => `![图片${i + 1}](${u})`).join('\n')}`,
        data: { imageUrls: urls, prompt, quality, ratio },
      };
    } catch (e) {
      return { success: false, output: '', error: `图片生成失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
