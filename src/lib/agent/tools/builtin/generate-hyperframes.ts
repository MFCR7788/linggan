// HyperFrames 动态图形 Agent 工具 — 脚本 → HTML+GSAP 动画 → 竖屏视频
// 适合产品介绍、社交媒体、知识讲解等文字动画视频

import type { ToolDefinition } from '../../types';
import { generateHyperFramesVideo } from '@/lib/ai/hyperframes';
import { saveMediaToInspiration } from '../save-media-helper';

const STYLE_LABELS: Record<string, string> = {
  product: '产品展示',
  social: '社交媒体',
  slide: '知识讲解',
};

export const generateHyperFramesTool: ToolDefinition = {
  name: 'generate_hyperframes',
  isLongRunning: true,
  description: `动态图形视频生成（HyperFrames）：输入脚本 → AI 自动生成 HTML+GSAP 动画 → 渲染为竖屏视频。
文字飞入、弹跳、缩放等动画效果，适合产品介绍、社交媒体、知识讲解。

与 generate_video 的区别：
- generate_video：AI 文生视频/图生视频（AI 生成真实画面）
- generate_hyperframes：文字动画视频（HTML+GSAP 动效渲染），无真实画面

3 种风格：
- product（产品展示）：品牌名→卖点弹入→CTA，深蓝金配色
- social（社交媒体）：快节奏冲击→大字报→互动引导，霓虹配色
- slide（知识讲解）：标题→逐页展开→总结，学术风配色

脚本上限 500 字，生成时间约 2-3 分钟。`,
  parameters: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: '脚本内容（≤500字）。AI 会自动拆分为分镜并生成动画。',
      },
      style: {
        type: 'string',
        enum: ['product', 'social', 'slide'],
        description: '风格。product(产品展示，默认)/social(社交媒体，快节奏)/slide(知识讲解，舒缓)。',
      },
      topic: {
        type: 'string',
        description: '主题/标题（可选）。用于视频标题和命名。',
      },
      duration: {
        type: 'number',
        description: '期望时长（秒），5-60 秒，默认 AI 自动判断。',
      },
    },
    required: ['script'],
  },
  async handler(params, ctx) {
    const script = params.script as string;
    const style = (params.style as string) || 'product';
    const topic = params.topic as string | undefined;
    const duration = params.duration as number | undefined;

    if (!script.trim()) {
      return { success: false, output: '', error: '脚本内容不能为空' };
    }

    try {
      const result = await generateHyperFramesVideo({
        script: script.trim(),
        userId: ctx.userId || 'anon',
        topic,
        style: style as 'product' | 'social' | 'slide',
        duration,
      });

      if (!result.success || !result.videoUrl) {
        return { success: false, output: '', error: result.error || '生成失败' };
      }

      // 自动保存到灵感库
      if (ctx.userId) {
        saveMediaToInspiration(
          ctx.userId, 'video',
          `动态图形：${(topic || script).substring(0, 25)}...`,
          [result.videoUrl],
          { toolName: 'hyperframes' }
        ).catch(() => {});
      }

      const styleLabel = STYLE_LABELS[style] || style;

      return {
        success: true,
        output: [
          '动态图形视频生成完成 ✨',
          '',
          `【风格】${styleLabel}`,
          `【时长】${result.duration} 秒`,
          `【消耗】${result.creditsUsed} 灵力`,
          '',
          `【脚本】(${script.trim().length}字)`,
          script.trim().length > 100 ? script.trim().substring(0, 100) + '...' : script.trim(),
          '',
          `【视频】${result.videoUrl}`,
          '',
          '💡 视频已自动保存到灵感库。文字动画效果由 GSAP 驱动渲染。',
        ].join('\n'),
        data: {
          videoUrl: result.videoUrl,
          style,
          duration: `${result.duration}s`,
          creditsUsed: result.creditsUsed,
          model: 'hyperframes',
          autoSaved: true,
        },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `动态图形生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
