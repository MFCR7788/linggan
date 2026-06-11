import type { ToolDefinition } from '../../types';
import { synthesizeWithCosyVoice } from '@/lib/ai-services';
import { saveMediaToInspiration } from '../save-media-helper';

export const synthesizeSpeechTool: ToolDefinition = {
  name: 'synthesize_speech',
  description: '将文字转换为语音。当用户要求朗读文字、生成配音、文字转语音时使用。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要转换的文字内容' },
      speed: { type: 'number', description: '语速 0.5-2.0（默认 1.0）' },
    },
    required: ['text'],
  },
  async handler(params, ctx) {
    const text = params.text as string;
    const speed = (params.speed as number) || 1.0;
    try {
      const result = await synthesizeWithCosyVoice({
        text,
        options: { speed },
      });
      if (!result) {
        return { success: false, output: '语音合成失败，未返回音频数据。' };
      }
      if (ctx.userId) {
        saveMediaToInspiration(ctx.userId, 'audio', text, []).catch(() => {});
      }
      return {
        success: true,
        output: `已生成语音并自动保存到灵感库，文本长度 ${text.length} 字。`,
        data: { audioBase64: result.toString('base64'), autoSaved: true },
      };
    } catch (e) {
      return { success: false, output: '', error: `语音合成失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
