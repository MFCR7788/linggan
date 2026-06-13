// 视频换人 Agent 工具 — 原视频人物替换为新人物
// 使用阿里云百炼 wan2.2-animate-mix 模型
// 保留原视频场景/运镜/产品/灯光，仅替换出镜人物

import type { ToolDefinition } from '../../types';
import { swapVideoFace } from '@/lib/ai/video-face-swap';
import { saveMediaToInspiration } from '../save-media-helper';

export const videoFaceSwapTool: ToolDefinition = {
  name: 'video_face_swap',
  isLongRunning: true,
  description: `视频换人（B方案-像素级）：保留原视频的场景/运镜/产品/灯光/背景，仅替换出镜人物。

与"换人复刻"的区别：
- 换人复刻（generate_agnes_video）：只保留文案，视频画面全由 AI 重新生成
- 视频换人（video_face_swap）：原视频完全保留，只换人脸，产品/场景/运镜都不变

适用场景：
- 带货视频换人：同一产品展示，换不同主播出镜
- 口播矩阵：同一文案视频，换不同人物形象
- 品牌视频本地化：保留品牌调性，换本地化人物

技术要求：
- 原视频：2-30 秒，≤200MB，MP4/AVI/MOV，人物正面出镜
- 新人物照片：正面清晰、五官可见、无遮挡，≤5MB
- 生成时间：约 2-5 分钟`,
  parameters: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: '原视频 URL（要换掉其中人物的视频）。2-30 秒，≤200MB，MP4/AVI/MOV。人物正面出镜效果最佳。',
      },
      imageUrl: {
        type: 'string',
        description: '新人物照片 URL（正面清晰、五官可见、无遮挡）。≤5MB，JPG/PNG。',
      },
      mode: {
        type: 'string',
        enum: ['wan-std', 'wan-pro'],
        description: '质量模式。wan-std（默认）：标准质量，生成快，省灵力。wan-pro：专业质量，更平滑自然，适合成品交付。',
      },
    },
    required: ['videoUrl', 'imageUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const imageUrl = params.imageUrl as string;
    const mode = (params.mode as 'wan-std' | 'wan-pro') || 'wan-std';

    try {
      const result = await swapVideoFace({ videoUrl, imageUrl, mode });

      if (!result.videoUrl) {
        return { success: false, output: '', error: '视频换人失败，未返回视频 URL' };
      }

      // 自动保存到灵感库
      if (ctx.userId) {
        saveMediaToInspiration(ctx.userId, 'video', '视频换人结果', [result.videoUrl]).catch(() => {});
      }

      const modeLabel = mode === 'wan-pro' ? '专业模式' : '标准模式';

      return {
        success: true,
        output: [
          '视频换人完成 ✨',
          '',
          `【质量】${modeLabel}`,
          `【原始视频】${videoUrl}`,
          `【新人物照片】${imageUrl}`,
          `【生成结果】${result.videoUrl}`,
          '',
          '---',
          '💡 视频已自动保存到灵感库。原视频的场景/产品/运镜/灯光保持不变。',
          '如需更高质量，可重新调用并设置 mode=wan-pro。',
        ].join('\n'),
        data: {
          videoUrl: result.videoUrl,
          sourceVideo: videoUrl,
          sourceImage: imageUrl,
          mode,
          model: 'wan2.2-animate-mix',
          autoSaved: true,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `视频换人失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
