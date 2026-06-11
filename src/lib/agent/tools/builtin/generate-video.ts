import type { ToolDefinition } from '../../types';
import {
  submitVideoGenerationTask,
  getVideoTaskStatusUniversal,
  submitAgnesVideoTask,
  getAgnesVideoTaskStatus,
} from '@/lib/ai/video';
import type { VideoProvider } from '@/lib/video-models';
import { saveMediaToInspiration } from '../save-media-helper';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 580_000; // 9 分 40 秒，留 20s 余量给 tool-timeout 的 600s

export const generateVideoTool: ToolDefinition = {
  name: 'generate_video',
  description: `根据文字描述 AI 生成视频（文生视频 / 图生视频），使用 Agnes Video V2.0 模型。
这是主要的视频生成工具。当用户要求制作视频、生成视频、做短片、文生视频、图生视频、把图片变成视频等时调用。

模型能力:
- 最高 1080p 25fps，最长 20 秒
- 原生音画同出（含环境音效）
- 支持中文/英文描述
- 支持图生视频（传入 imageUrl 作为首帧）
- 支持多种运镜效果（在 prompt 中描述即可，如"相机缓慢推进"、"从远处拉近"）

分辨率(resolution):
- 720p: 1280x768，生成快（默认推荐）
- 1080p: 1920x1080，全高清

比例(ratio): 16:9（默认，横屏）, 9:16（竖屏）, 1:1（方形）

图生视频: 如果用户提供了图片或希望基于图片生成视频，传入 imageUrl 参数。

注意: 此工具是 AI 直接生成视频画面，不是套用模板。如需使用预置模板（片头/抖音短视频），请使用 generate_video_template 工具。`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '视频描述。中文即可。可包含：场景、主体、动作、运镜（推/拉/摇/移/跟）、光影变化、氛围。越详细效果越好。',
      },
      duration: { type: 'number', description: '视频时长（秒），默认 5，最长 20' },
      resolution: { type: 'string', enum: ['720p', '1080p'], description: '分辨率，默认 720p' },
      ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: '视频比例，默认 16:9' },
      imageUrl: { type: 'string', description: '可选的首帧图片 URL，用于图生视频(I2V)。用户上传图片或要求基于图片生成视频时传入。' },
    },
    required: ['prompt'],
  },
  async handler(params, ctx) {
    const prompt = params.prompt as string;
    const duration = (params.duration as number) || 5;
    const resolution = (params.resolution as '720p' | '1080p') || '720p';
    const ratio = (params.ratio as string) || '16:9';
    const imageUrl = params.imageUrl as string | undefined;

    // 1. 提交任务（优先 Agnes，降级 Wan 2.6）
    let taskId: string;
    let model: string;
    let provider: VideoProvider | 'agnes';
    let useAgnes = false;

    try {
      const agnesResult = await submitAgnesVideoTask(prompt, { duration, resolution, ratio, imageUrl });
      if (agnesResult.taskId) {
        taskId = agnesResult.taskId;
        model = 'agnes-video-v2.0';
        provider = 'agnes';
        useAgnes = true;
      } else {
        throw new Error(agnesResult.message || 'Agnes 返回空 taskId');
      }
    } catch (agnesErr) {
      console.warn('[generate_video] Agnes 失败，降级 Wan 2.6:', agnesErr);
      try {
        const tier = resolution === '1080p' ? 'standard' : 'fast';
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
    }

    // 2. 轮询等待完成
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      try {
        const status = useAgnes
          ? await getAgnesVideoTaskStatus(taskId)
          : await getVideoTaskStatusUniversal(taskId, provider as VideoProvider);

        if (status.status === 'succeeded' && status.videoUrl) {
          if (ctx.userId) {
            saveMediaToInspiration(ctx.userId, 'video', prompt, [status.videoUrl]).catch(() => {});
          }
          return {
            success: true,
            output: `视频已生成完成！`,
            data: {
              taskId,
              videoUrl: status.videoUrl,
              status: 'succeeded',
              model,
              duration,
              resolution,
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
        duration,
        resolution,
      },
    };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
