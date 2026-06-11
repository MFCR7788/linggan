import type { ToolDefinition } from '../../types';
import { submitVideoGenerationTask, getVideoTaskStatusUniversal } from '@/lib/ai/video';
import type { VideoProvider } from '@/lib/video-models';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 280_000; // 4 分 40 秒，留 20s 余量给 tool-timeout 的 300s

export const generateVideoTool: ToolDefinition = {
  name: 'generate_video',
  description: `根据文字描述生成视频，支持文生视频(T2V)和图生视频(I2V)。
当用户要求制作视频、生成视频、做短片等时使用。

质量档位(tier):
- fast: 流畅 720P，最长5秒，生成快（推荐）
- standard: 高清 1080P，最长10秒
- premium: 超清 1080P，最长15秒

图生视频: 如果用户提供了图片或希望基于图片生成视频，传入 imageUrl 参数。

视频生成需要 1-3 分钟，工具会自动等待完成后返回视频链接。`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频描述' },
      duration: { type: 'number', description: '视频时长（秒），默认 5' },
      tier: {
        type: 'string',
        enum: ['fast', 'standard', 'premium'],
        description: '质量档位，默认 fast',
      },
      imageUrl: { type: 'string', description: '可选的首帧图片 URL，用于图生视频(I2V)' },
    },
    required: ['prompt'],
  },
  async handler(params, _ctx) {
    const prompt = params.prompt as string;
    const duration = (params.duration as number) || 5;
    const tier = (params.tier as string) || 'fast';
    const imageUrl = params.imageUrl as string | undefined;

    // 1. 提交任务
    let taskId: string | null;
    let model: string;
    let provider: VideoProvider;

    try {
      const result = await submitVideoGenerationTask(tier, prompt, duration, imageUrl);
      if (!result.taskId) {
        return { success: false, output: '', error: result.message || '视频任务提交失败' };
      }
      taskId = result.taskId;
      model = result.model;
      provider = result.provider;
    } catch (e) {
      return { success: false, output: '', error: `视频提交失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    // 2. 轮询等待完成
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      try {
        const status = await getVideoTaskStatusUniversal(taskId, provider);

        if (status.status === 'succeeded' && status.videoUrl) {
          return {
            success: true,
            output: `视频已生成完成！`,
            data: {
              taskId,
              videoUrl: status.videoUrl,
              status: 'succeeded',
              model,
              tier,
            },
          };
        }

        if (status.status === 'failed') {
          return {
            success: false,
            output: '',
            error: status.message || '视频生成失败',
          };
        }
        // running / queued → 继续轮询
      } catch {
        // 查询失败不中断，继续轮询
      }
    }

    // 3. 超时 → 返回任务 ID，不报错
    return {
      success: true,
      output: `视频仍在生成中（任务ID: ${taskId}）。通常需要 2-5 分钟完成，您可以稍后在视频页面查看结果。`,
      data: {
        taskId,
        status: 'running',
        model,
        tier,
      },
    };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
