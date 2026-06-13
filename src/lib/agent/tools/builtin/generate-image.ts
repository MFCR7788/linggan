import type { ToolDefinition } from '../../types';
import { generateImageAgnes } from '@/lib/ai/image';
import { generateImage } from '@/lib/ai-services';
import { saveMediaToInspiration } from '../save-media-helper';

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  isLongRunning: true,
  description: `根据文字描述生成图片（文生图），使用 Agnes Image 2.1 Flash 模型。
当用户要求画图、生成图片、做海报、做封面、设计图、生成照片、画一个/张/幅等时调用。

质量档位(quality):
- standard: 1024px，生成快速（默认推荐）
- hd: 1920px，高画质
- 4k: 3840px，超高清（生成较慢，约 30-60 秒）

比例(ratio): 1:1（默认）, 16:9, 9:16, 4:3, 3:4

【分镜/系列图一致性】
生成多张系列图（如分镜、同一角色的不同场景）时：
- seed: 使用相同 seed（如 42）确保风格、色调、光影一致
- referenceImageUrl: 传入已生成的第一张图 URL 作为构图/风格参考
- 最佳实践: 先确定统一的视觉风格描述（角色外观、场景基调），每张 prompt 仅变化动作/角度/场景，风格描述保持不变
- 多图生成: n 参数可一次生成多张变体，同一批次风格更接近`,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '图片描述。中文即可，模型原生支持中文，无需翻译。描述越详细效果越好，可包含：主体、场景、风格、光影、色彩、构图等。',
      },
      ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], description: '图片比例，默认 1:1' },
      quality: { type: 'string', enum: ['standard', 'hd', '4k'], description: '质量档位，默认 standard' },
      seed: { type: 'number', description: '随机种子。分镜/系列图用相同 seed 确保风格色调一致（如 42）' },
      n: { type: 'number', description: '一次生成的张数（1-4），默认 1。同一批次风格更接近' },
      referenceImageUrl: { type: 'string', description: '参考图 URL。后续图可传首张图 URL 作为风格/构图参考' },
    },
    required: ['prompt'],
  },
  async handler(params, ctx) {
    const prompt = params.prompt as string;
    const ratio = (params.ratio as string) || '1:1';
    const quality = ((params.quality as string) || 'standard') as 'standard' | 'hd' | '4k';
    const seed = params.seed != null ? (params.seed as number) : undefined;
    const n = params.n != null ? Math.min(params.n as number, 4) : 1;
    const referenceImageUrl = params.referenceImageUrl as string | undefined;
    try {
      let result;
      let model = 'agnes-image-2.1-flash';
      try {
        result = await generateImageAgnes(prompt, {
          ratio: ratio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
          quality,
          seed,
          n,
          referenceImageUrl,
        });
      } catch (agnesErr) {
        console.warn('[generate_image] Agnes 失败，降级 DashScope:', agnesErr);
        const dashResult = await generateImage(prompt, { ratio: ratio as '1:1' | '16:9' | '9:16' });
        result = dashResult;
        model = 'wanx2.1-t2i-turbo';
      }
      const images = Array.isArray(result) ? result : [result];
      const urls = images.map((img) => img.imageUrl).filter(Boolean);
      if (urls.length === 0) {
        return { success: false, output: '图片生成失败，未返回图片 URL。' };
      }

      // 自动保存到灵感库
      if (ctx.userId) {
        saveMediaToInspiration(ctx.userId, 'image', prompt, urls, { toolName: 'generate_image' }).catch(() => {});
      }

      return {
        success: true,
        output: `已生成 ${urls.length} 张图片并自动保存到灵感库（${model}）`,
        data: { imageUrls: urls, prompt, quality, ratio, model, autoSaved: true },
      };
    } catch (e) {
      return { success: false, output: '', error: `图片生成失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
