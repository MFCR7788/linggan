import type { ToolDefinition } from '../../types';
import { summarizeContent } from '@/lib/ai-services';

export const summarizeTool: ToolDefinition = {
  name: 'summarize',
  description: '总结、提炼长文本内容。当用户要求概括、总结、提炼一篇文章或一段文字时使用。',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '需要总结的文本内容' },
      contentType: { type: 'string', description: '内容类型: article, video_transcript, document（默认 article）' },
    },
    required: ['content'],
  },
  async handler(params, _ctx) {
    const content = params.content as string;
    const contentType = (params.contentType as string) || 'article';
    try {
      const result = await summarizeContent(content, contentType);
      return {
        success: true,
        output: result.summary || result.keyPoints?.join('\n') || '总结完成',
        data: result,
      };
    } catch (e) {
      return { success: false, output: '', error: `总结失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
