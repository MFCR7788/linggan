import type { ToolDefinition } from '../../types';

export const editImageTool: ToolDefinition = {
  name: 'edit_image',
  description: '编辑或增强图片。支持去背景、变清晰、智能扩展等操作。需要已有图片的URL。',
  parameters: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string', description: '要编辑的图片URL' },
      operation: { type: 'string', description: '编辑操作: remove_bg(去背景), enhance(变清晰/增强), expand(智能扩展)。默认 enhance' },
      prompt: { type: 'string', description: '额外的编辑提示（可选，如"将背景替换为白色"）' },
    },
    required: ['imageUrl', 'operation'],
  },
  async handler(params, _ctx) {
    const imageUrl = params.imageUrl as string;
    const operation = (params.operation as string) || 'enhance';
    const prompt = params.prompt as string | undefined;

    const opLabels: Record<string, string> = {
      remove_bg: '去背景', enhance: '变清晰', expand: '智能扩展',
    };

    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/ai/image/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, action: operation, prompt }),
      });

      const data = await res.json();

      if (data.success && data.data?.resultUrl) {
        return {
          success: true,
          output: `图片${opLabels[operation] || '编辑'}成功！\n![编辑结果](${data.data.resultUrl})`,
          data: { resultUrl: data.data.resultUrl, operation },
        };
      }

      return {
        success: false,
        output: `图片编辑失败: ${data.error || '未知错误'}`,
        error: data.error,
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `图片编辑失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
