import type { ToolDefinition } from '../../types';
import { callDoubaoVision } from '@/lib/ai-services';

export const analyzeImageTool: ToolDefinition = {
  name: 'analyze_image',
  description: '分析图片内容，获取图片的详细描述。当用户上传图片并要求分析、描述、识别图片内容时使用。',
  parameters: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string', description: '图片 URL 地址' },
      question: { type: 'string', description: '要了解的具体方面（可选），如"描述场景"、"识别文字"、"分析风格"' },
    },
    required: ['imageUrl'],
  },
  async handler(params, _ctx) {
    const imageUrl = params.imageUrl as string;
    const question = (params.question as string) || '请详细描述这张图片的内容、风格、色彩和构图';
    try {
      const result = await callDoubaoVision(imageUrl, question);
      return {
        success: true,
        output: result.description || '图片分析完成',
        data: result,
      };
    } catch (e) {
      return { success: false, output: '', error: `图片分析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
