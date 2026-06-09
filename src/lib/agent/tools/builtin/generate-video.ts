import type { ToolDefinition } from '../../types';
import { submitVideoTask } from '@/lib/ai-services';

export const generateVideoTool: ToolDefinition = {
  name: 'generate_video',
  description: '根据文字描述生成视频。当用户要求制作视频、生成视频、做短片等时使用。注意：视频生成需要等待，会返回任务 ID 供后续查询。',
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频描述' },
      duration: { type: 'number', description: '视频时长（秒），默认 5' },
    },
    required: ['prompt'],
  },
  async handler(params, _ctx) {
    const prompt = params.prompt as string;
    const duration = (params.duration as number) || 5;
    try {
      const result = await submitVideoTask(prompt, duration, '16:9');
      return {
        success: true,
        output: `视频任务已提交。任务 ID: ${result.taskId}。视频生成通常需要 2-5 分钟，请告知用户稍后查看结果。`,
        data: { taskId: result.taskId, status: result.status },
      };
    } catch (e) {
      return { success: false, output: '', error: `视频生成失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
