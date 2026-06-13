// 口播视频生成 Agent 工具 — 照片+文案 → 口播视频
// 使用 Agnes Video V2.0 模型，原生口型同步+配音+运镜
// A方案：适合纯口播类短视频，场景由照片决定

import type { ToolDefinition } from '../../types';
import { generateAgnesVideo } from '@/lib/ai/agnes-video';
import { saveMediaToInspiration } from '../save-media-helper';

export const generateAgnesVideoTool: ToolDefinition = {
  name: 'generate_agnes_video',
  isLongRunning: true,
  description: `口播视频生成（A方案）：用一张人物照片 + 口播文案，AI 生成口播视频。
Agnes Video V2.0 原生口型同步+配音+运镜，照片变成动态口播视频。

适用场景：
- 口播矩阵：同一段文案，换不同人物照片批量生成
- 创始人 IP：照片 + 口播稿 → 个人口播短视频
- 虚拟主播：虚拟形象 + 脚本 → 口播视频
- 换人复刻：提取原视频文案 → 新人物照片 → 口播视频

⚠️ 注意：场景来自照片，不会自动生成新背景。如需保留原视频场景/产品 → 请用 B方案 video_face_swap。

时长参考（帧数@24fps）：
- 81帧≈3.4秒（一句话钩子）| 121帧≈5秒 | 161帧≈6.7秒（默认，约40字）
- 201帧≈8.4秒（约50字）| 241帧≈10秒（约60字）
- 321帧≈13.4秒 | 441帧≈18.4秒（最长口播）`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '人物照片 URL（正面、清晰、五官可见）。照片场景即视频背景，选带合适背景的照片。',
      },
      script: {
        type: 'string',
        description: '口播文案。建议 40-60 字（默认 6.7 秒），最长不超过 80 字。',
      },
      numFrames: {
        type: 'number',
        description: '帧数控制时长。默认 161（≈6.7秒，约40字）。参考：121≈5s / 241≈10s / 441≈18.4s',
      },
      seed: {
        type: 'number',
        description: '随机种子。同一人物+同一种子可复现相似运镜风格。',
      },
    },
    required: ['imageUrl', 'script'],
  },
  async handler(params, ctx) {
    const imageUrl = params.imageUrl as string;
    const script = params.script as string;
    const numFrames = params.numFrames as number | undefined;
    const seed = params.seed as number | undefined;

    if (!script.trim()) {
      return { success: false, output: '', error: '口播文案不能为空' };
    }

    try {
      // 构建电影级口播视频 prompt（含运镜+光影+氛围）
      const videoPrompt = [
        'Cinematic talking head video, social media content style.',
        '',
        'Subject: The person in the image speaks directly to camera.',
        'Speech: ' + script.trim(),
        '',
        'Performance: Natural and authentic delivery, conversational tone.',
        'Facial expressions match the emotional beats of the speech.',
        'Slight natural head movements, relaxed shoulders, genuine eye contact.',
        '',
        'Camera: Slow dolly push-in towards the face over the full duration.',
        'Subtle handheld micro-movements for organic feel.',
        'Shallow depth of field — background softly blurred throughout.',
        '',
        'Lighting: Soft key light from front-left, gentle rim light separating subject from background.',
        'Warm color temperature, cinematic color grading, slight film grain.',
        '',
        'Output: 1080p, cinematic quality, vertical 9:16 social format.',
      ].join('\n');

      const result = await generateAgnesVideo({
        imageUrl,
        prompt: videoPrompt,
        numFrames,
        seed,
      });

      if (!result.videoUrl) {
        return { success: false, output: '', error: '视频生成失败，未返回视频 URL' };
      }

      // 自动保存到灵感库
      if (ctx.userId) {
        saveMediaToInspiration(ctx.userId, 'video', `换人复刻：${script.trim().substring(0, 30)}...`, [result.videoUrl]).catch(() => {});
      }

      const durationSec = numFrames ? ((numFrames / 24)).toFixed(1) : '6.7';
      const wordCount = script.trim().length;

      return {
        success: true,
        output: [
          '已生成换人复刻口播视频 ✨',
          '',
          `【文案】(${wordCount}字 ≈ ${durationSec}秒)`,
          script.trim(),
          '',
          `【视频】${result.videoUrl}`,
          '',
          '---',
          '💡 视频已自动保存到灵感库。如需调整时长，重新调用时修改 numFrames 参数。',
        ].join('\n'),
        data: {
          videoUrl: result.videoUrl,
          script: script.trim(),
          duration: `${durationSec}s`,
          model: 'agnes-video-v2.0',
          autoSaved: true,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `换人复刻失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
