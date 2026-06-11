import type { ToolDefinition } from '../../types';
import { editImageAgnes, editImageDashScope, type EditOperation } from '@/lib/ai/image';
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
        output: `图片${OP_LABELS[operation] || '编辑'}成功，已自动保存到灵感库（agnes-image-2.1-flash）！`,
        data: { resultUrl: result.imageUrl, operation, model: 'agnes-image-2.1-flash', autoSaved: true },
      };
    } catch (agnesErr) {
      console.warn('[edit_image] Agnes 失败，降级 DashScope:', agnesErr);

      // 降级到 DashScope qwen-image-edit-plus（直调 API，不走需认证的路由）
      const dashOp = operation === 'style_transfer' || operation === 'inpaint' ? 'enhance' : operation;
      try {
        const resultUrl = await editImageDashScope(imageUrl, dashOp, prompt);
        if (ctx.userId) {
          saveMediaToInspiration(ctx.userId, 'image', prompt || imageUrl, [resultUrl]).catch(() => {});
        }
        return {
          success: true,
          output: `图片${OP_LABELS[operation] || '编辑'}成功，已自动保存到灵感库（qwen-image-edit-plus 降级）！`,
          data: { resultUrl, operation, model: 'qwen-image-edit-plus', fallback: true, autoSaved: true },
        };
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
