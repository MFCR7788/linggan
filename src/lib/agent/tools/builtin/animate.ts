import type { ToolDefinition } from '../../types';

export const generateAnimateVideoTool: ToolDefinition = {
  name: 'generate_animate_video',
  description: '使用预配置的角色形象生成动作迁移视频（wan2.2-animate）。让静态角色图片"复刻"参考视频中的动作和表情。需要用户提供参考动作视频URL。如果用户已在"AI数字人"页面配置了角色形象，会自动使用预配置的图片。',
  parameters: {
    type: 'object',
    properties: {
      videoUrl: { type: 'string', description: '参考动作视频URL（必填，角色将复刻该视频中的动作和表情）' },
      imageUrl: { type: 'string', description: '角色形象图片URL（可选，不填则使用预配置的形象）' },
      mode: { type: 'string', description: '模式: animate(动作迁移，默认) 或 replace(角色替换)' },
    },
    required: ['videoUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const mode = (params.mode as string) || 'animate';
    let imageUrl = (params.imageUrl as string) || undefined;

    // 优先使用参数传入的 imageUrl，否则用预配置
    if (!imageUrl && ctx.presets?.animate?.imageUrl) {
      imageUrl = ctx.presets.animate.imageUrl;
    }

    if (!imageUrl) {
      return {
        success: false,
        output: '需要角色形象图片。请提供 imageUrl 参数，或先去"AI数字人"页面配置"我的形象"。',
        error: 'no_image_url',
      };
    }

    try {
      const { submitAnimateTask } = await import('@/lib/ai-services');
      const result = await submitAnimateTask({
        imageUrl,
        videoUrl,
        mode: mode === 'replace' ? 'replace' : 'animate',
        resolution: '720P',
      });

      if (!result.taskId) {
        return {
          success: false,
          output: `动作迁移任务提交失败: ${result.message}`,
          error: result.message,
        };
      }

      const presetName = ctx.presets?.animate?.name;
      const modeLabel = mode === 'replace' ? '角色替换' : '动作迁移';

      return {
        success: true,
        output: `角色${modeLabel}任务已提交！${presetName ? `\n形象: ${presetName}` : ''}\n任务ID: ${result.taskId}\n预计耗时: 1-3 分钟`,
        data: { taskId: result.taskId, imageUrl, videoUrl, mode, status: 'processing' },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `动作迁移任务失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
