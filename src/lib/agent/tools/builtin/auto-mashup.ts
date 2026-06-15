// AI 混剪 Agent Tool — 多素材智能编排 + 合成
// 底层引擎: mashup-engine.ts (FFmpeg + DeepSeek LLM)

import type { ToolDefinition } from '../../types';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { saveMediaToInspiration } from '../save-media-helper';
import { runMashupPipeline } from '@/lib/ai/mashup-engine';
import type { MashupStyle, MashupRatio, BgmStyle } from '@/lib/ai/mashup-engine';
import { readFileSync } from 'fs';

const STYLE_LABELS: Record<string, string> = {
  '快节奏': '⚡ 快节奏', '舒缓Vlog': '🌿 舒缓Vlog',
  '教程解说': '📚 教程解说', '产品开箱': '📦 产品开箱',
};

export const autoMashupTool: ToolDefinition = {
  name: 'auto_mashup',
  description: `将多段视频素材智能混剪为一个完整视频。自动分析素材 → LLM 编排镜头 → FFmpeg 合成（含转场+BGM）。
使用场景：当用户要求"混剪"、"视频混剪"、"剪辑合成"、"多段素材合成一个视频"、"拼接视频"、"视频编排"时调用。

与 compose_video 的区别：
- compose_video：将多张图片合成视频（图片→视频，带字幕+BGM）
- auto_mashup：将多段视频素材混剪合成（视频→视频，带转场+BGM）

与 smart_clip 的区别：
- smart_clip：对单段视频进行精剪（去废话/静音）
- auto_mashup：对多段素材进行创意编排混剪

支持 4 种风格：快节奏/舒缓Vlog/教程解说/产品开箱
支持 4 种比例：9:16竖屏/16:9横屏/1:1方形/3:4小红书
支持 5 种 BGM：潮流/科技/舒缓/优雅/活力（或关BGM）
转场效果：硬切/淡入淡出/左滑/右滑/放大`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      videoUrls: {
        type: 'array',
        description: '视频素材 URL 列表（至少 2 段，最多 20 段）',
        items: { type: 'string' },
      },
      style: {
        type: 'string',
        enum: ['快节奏', '舒缓Vlog', '教程解说', '产品开箱'],
        description: '混剪风格。默认 快节奏',
      },
      ratio: {
        type: 'string',
        enum: ['9:16', '16:9', '1:1', '3:4'],
        description: '输出比例。默认 9:16 竖屏',
      },
      bgm: {
        type: 'string',
        enum: ['hype', 'tech', 'chill', 'elegant', 'energetic', 'none'],
        description: 'BGM 风格。默认 auto（由编排方案决定）',
      },
      goal: {
        type: 'string',
        description: '创作目标描述，如"30秒快节奏种草视频"',
      },
      targetDuration: {
        type: 'number',
        description: '目标时长（秒），默认 30',
      },
    },
    required: ['videoUrls'],
  },
  async handler(params, ctx) {
    const videoUrls = params.videoUrls as string[];
    const style = (params.style as MashupStyle) || '快节奏';
    const ratio = (params.ratio as MashupRatio) || '9:16';
    const bgm = params.bgm as BgmStyle | undefined;
    const goal = params.goal as string | undefined;
    const targetDuration = (params.targetDuration as number) || 30;

    if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
      return { success: false, output: '', error: '至少需要 2 段视频素材' };
    }
    if (videoUrls.length > 20) {
      return { success: false, output: '', error: '最多支持 20 段视频素材' };
    }

    const dir = getTempDir('agent-mashup');

    try {
      // 执行完整流水线
      const { plan, outputPath } = await runMashupPipeline(
        videoUrls, dir,
        { videoUrls, style, ratio, bgm, goal, targetDuration },
        (step, pct) => { /* progress could be reported via SSE if needed */ },
      );

      // 上传结果
      const supabase = createAdminClient();
      const videoBuffer = readFileSync(outputPath);
      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
      const storageKey = `mashup/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, videoBuffer, { contentType: 'video/mp4', upsert: false });
      if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
      const publicUrl = urlData.publicUrl;

      // 保存到灵感库
      if (ctx.userId) {
        saveMediaToInspiration(
          ctx.userId, 'video',
          `混剪: ${plan.summary} (${plan.totalDuration.toFixed(0)}s)`,
          [publicUrl],
          { toolName: 'auto_mashup' }
        ).catch(() => {});
      }

      // 清理
      try { cleanupTempDir(dir); } catch {}

      const styleLabel = STYLE_LABELS[style] || style;
      const transitions = plan.arrangements.map((a, i) =>
        `${i + 1}. 素材${a.clipIndex} | ${a.duration.toFixed(0)}s | ${a.transition}`
      ).join('\n');

      return {
        success: true,
        output: [
          `混剪完成！`,
          ``,
          `🎬 **视频链接**: ${publicUrl}`,
          `⏱ **总时长**: ${plan.totalDuration.toFixed(0)}秒`,
          `🎯 **风格**: ${styleLabel}`,
          `🎵 **BGM**: ${plan.bgmStyle}`,
          `🎞️ **镜头数**: ${plan.arrangements.length}`,
          `📦 **文件大小**: ${sizeMB} MB`,
          ``,
          `📋 **编排方案**: ${plan.summary}`,
          ``,
          `**镜头顺序**:`,
          transitions,
          ``,
          `已自动保存到灵感库。`,
        ].join('\n'),
        data: {
          videoUrl: publicUrl,
          storageKey,
          duration: plan.totalDuration,
          clipCount: plan.arrangements.length,
          sourceCount: videoUrls.length,
          style,
          ratio,
          bgmStyle: plan.bgmStyle,
          sizeBytes: videoBuffer.length,
          autoSaved: true,
        },
      };
    } catch (e) {
      try { cleanupTempDir(dir); } catch {}
      return {
        success: false,
        output: '',
        error: `混剪失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
