import type { ToolDefinition } from '../../types';
import { editImageAgnes, type EditOperation } from '@/lib/ai/image';
import { saveMediaToInspiration } from '../save-media-helper';

const OP_LABELS: Record<string, string> = {
  enhance: '增强画质',
  remove_bg: '去背景',
  style_transfer: '风格转换',
  inpaint: '局部修复',
  expand: '智能扩展',
};

export const editImageTool: ToolDefinition = {
  name: 'edit_image',
  isLongRunning: true,
  description: `编辑或增强图片，使用 Agnes Image 2.1 Flash 模型。
支持操作(operation):
- enhance: 提升清晰度和色彩（默认）
- remove_bg: 移除背景，替换为白色
- style_transfer: 转换风格（需在 prompt 中指定目标风格，如"吉卜力动画风格"、"油画风格"）
- inpaint: 局部修复/替换
- expand: 智能扩展画面

需要已有图片的 imageUrl。`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string', description: '要编辑的图片 URL' },
      operation: {
        type: 'string',
        enum: ['enhance', 'remove_bg', 'style_transfer', 'inpaint', 'expand'],
        description: '编辑操作。enhance(增强画质), remove_bg(去背景), style_transfer(风格转换), inpaint(局部修复), expand(智能扩展)。默认 enhance',
      },
      prompt: {
        type: 'string',
        description: '额外的编辑提示。style_transfer 时需要目标风格描述，如"转换为吉卜力动画风格"',
      },
    },
    required: ['imageUrl'],
  },
  async handler(params, ctx) {
    const imageUrl = params.imageUrl as string;
    const operation = (params.operation as EditOperation) || 'enhance';
    const prompt = params.prompt as string | undefined;

    try {
      const result = await editImageAgnes({ image: imageUrl, operation, prompt });
      if (ctx.userId) {
        saveMediaToInspiration(ctx.userId, 'image', prompt || imageUrl, [result.imageUrl]).catch(() => {});
      }
      return {
        success: true,
        output: `图片${OP_LABELS[operation] || '编辑'}成功！\n![编辑结果](${result.imageUrl})`,
        data: { resultUrl: result.imageUrl, operation },
      };
    } catch (agnesErr) {
      console.warn('[edit_image] Agnes 失败，尝试 API 降级:', agnesErr);

      // 降级到原有 API 路由
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const res = await fetch(`${baseUrl}/api/ai/image/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl, action: operation === 'style_transfer' ? 'enhance' : operation, prompt }),
        });
        const data = await res.json();
        if (data.success && data.data?.resultUrl) {
          return {
            success: true,
            output: `图片${OP_LABELS[operation] || '编辑'}成功！\n![编辑结果](${data.data.resultUrl})`,
            data: { resultUrl: data.data.resultUrl, operation },
          };
        }
        return { success: false, output: `图片编辑失败: ${data.error || '未知错误'}`, error: data.error };
      } catch (e2) {
        return {
          success: false,
          output: '',
          error: `图片编辑失败: ${e2 instanceof Error ? e2.message : String(e2)}`,
        };
      }
    }
  },
};
