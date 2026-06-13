// 换人复刻 Agent 工具 — 照片+文案 → 口播视频
// 使用 Agnes Video V2.0 模型，支持原生口型同步+配音
// 可从原视频提取文案后复刻为新人物口播视频

import type { ToolDefinition } from '../../types';
import { generateAgnesVideo } from '@/lib/ai/agnes-video';
import { saveMediaToInspiration } from '../save-media-helper';

export const generateAgnesVideoTool: ToolDefinition = {
  name: 'generate_agnes_video',
  isLongRunning: true,
  description: `换人复刻：用一张人物照片 + 口播文案，AI 生成新人物口播视频（Agnes Video V2.0，原生口型同步+配音）。

适用场景：
- 换人复刻：提取原视频口播文案 → 换上新主角照片 → 生成新视频
- 虚拟主播：用虚拟形象照片 + 脚本 → 生成口播视频
- 批量口播：同一人物照片 + 多段不同脚本 → 批量生成系列视频

时长参考（帧数@24fps）：
- 81帧≈3.4秒（超短，一句话）| 121帧≈5秒 | 161帧≈6.7秒（默认，约40字）
- 201帧≈8.4秒（约50字）| 241帧≈10秒（约60字）
- 281帧≈11.7秒 | 321帧≈13.4秒 | 361帧≈15秒 | 401帧≈16.7秒 | 441帧≈18.4秒（最长）

⚠️ 建议先用 extract_content 从原视频提取出文案，再传入本工具生成换人后的新视频。`,
  parameters: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: '新主角的照片 URL（正面、清晰、五官可见）。可从灵感库选取或直接给 URL。',
      },
      script: {
        type: 'string',
        description: '口播文案。如果是换人复刻，先调用 extract_content 从原视频提取文案，再用此文案传入。建议控制在 40-60 字（对应默认 6.7 秒），最长不超过 80 字。',
      },
      numFrames: {
        type: 'number',
        description: '帧数控制时长（8n+1 格式）。默认 161（≈6.7秒）。参考：121≈5s / 161≈6.7s / 241≈10s / 321≈13.4s / 441≈18.4s',
      },
      seed: {
        type: 'number',
        description: '随机种子。同一人物+同一种子可复现相似风格。留空则随机。',
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
      // 构建视频 prompt（描述人物说话的场景）
      const videoPrompt = [
        'A person is speaking naturally to the camera.',
        'The speech content is:',
        script.trim(),
        'The delivery is natural and engaging, with subtle facial expressions and slight head movements.',
        'Professional lighting, clean background, 1080p quality.',
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
