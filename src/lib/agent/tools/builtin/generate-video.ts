import type { ToolDefinition } from '../../types';
import {
  submitVideoGenerationTask,
  getVideoTaskStatusUniversal,
  submitAgnesVideoTask,
  getAgnesVideoTaskStatus,
} from '@/lib/ai/video';
import { submitSeedanceTask } from '@/lib/ai/seedance';
import type { VideoProvider } from '@/lib/video-models';
import { saveMediaToInspiration } from '../save-media-helper';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 580_000; // 9 分 40 秒，留 20s 余量给 tool-timeout 的 600s

export const generateVideoTool: ToolDefinition = {
  name: 'generate_video',
  description: `根据文字描述或图片 AI 生成视频（文生视频 / 图生视频）。

视频引擎（自动选择最优）:
- Seedance 2.0: 图生视频首选，专业运镜（推/拉/摇/移/跟），产品一致性高，最长 15 秒
- Agnes Video V2.0: 文生视频首选，原生音画同出，最长 20 秒
- Wan 2.6: 降级引擎，DashScope 百炼

模型能力:
- 最高 1080p，最长 20 秒
- 支持中文/英文描述
- 支持图生视频（传入 imageUrl 作为首帧）
- 支持多种运镜效果（在 prompt 中描述即可，如"相机缓慢推进"、"从远处拉近"）

分辨率(resolution):
- 720p: 生成快（默认推荐）
- 1080p: 全高清

比例(ratio): 16:9（默认，横屏）, 9:16（竖屏）, 1:1（方形）

图生视频: 如果用户提供了图片或希望基于图片生成视频，传入 imageUrl 参数。优先使用 Seedance 2.0 引擎。

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

    // 1. 提交任务 — 图生视频优先 Seedance，文生视频走 Agnes→Wan
    let taskId = '';
    let model = '';
    let provider: VideoProvider | 'agnes' | 'seedance' = 'dashscope';
    let useAgnes = false;
    let useSeedance = false;

    // 路由：有图 → Seedance I2V（运镜+产品保持），无图 → Agnes T2V
    if (imageUrl) {
      try {
        const sdResult = await submitSeedanceTask({
          prompt,
          imageUrl,
          duration: Math.min(duration, 15), // Seedance 最长 15s
          ratio: ratio as '16:9' | '9:16' | '1:1',
          resolution: resolution === '1080p' ? '1080p' : '720p',
        });
        if (sdResult.taskId) {
          taskId = sdResult.taskId;
          model = sdResult.model;
          provider = 'seedance';
          useSeedance = true;
        }
      } catch (sdErr) {
        console.warn('[generate_video] Seedance 失败，降级 Agnes:', sdErr);
      }
    }

    if (!useSeedance) {
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
    }

    if (!taskId) {
      return { success: false, output: '', error: '所有视频引擎均提交失败，请稍后重试' };
    }

    // 2. 轮询等待完成
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      try {
        let status: { status: string; videoUrl?: string; message?: string };
        if (useSeedance) {
          const { getSeedanceTaskStatus } = await import('@/lib/ai/seedance');
          const sdStatus = await getSeedanceTaskStatus(taskId);
          status = { status: sdStatus.status, videoUrl: sdStatus.videoUrl, message: sdStatus.message };
        } else if (useAgnes) {
          status = await getAgnesVideoTaskStatus(taskId);
        } else {
          status = await getVideoTaskStatusUniversal(taskId, provider as VideoProvider);
        }

        if (status.status === 'succeeded' && status.videoUrl) {
          if (ctx.userId) {
            saveMediaToInspiration(ctx.userId, 'video', prompt, [status.videoUrl], { toolName: 'generate_video' }).catch(() => {});
          }
          return {
            success: true,
            output: `视频已生成完成，已自动保存到灵感库！`,
            data: {
              taskId,
              videoUrl: status.videoUrl,
              status: 'succeeded',
              model,
              duration,
              resolution,
              autoSaved: true,
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
