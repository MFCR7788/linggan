// 智能剪辑 Agent Tool — 去废话/静音/重复，保留核心内容
// 底层引擎: smart-clip-engine.ts (FFmpeg + FunASR + DeepSeek LLM)

import type { ToolDefinition } from '../../types';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { saveMediaToInspiration } from '../save-media-helper';
import { runAnalyzePipeline, executeClip } from '@/lib/ai/smart-clip-engine';
import type { ClipMode } from '@/lib/ai/smart-clip-engine';
import { readFileSync } from 'fs';

export const smartClipTool: ToolDefinition = {
  name: 'smart_clip',
  description: `智能剪辑视频，自动去除静音、口头禅（嗯、啊、那个等）、重复语句，保留核心内容。
使用场景：当用户要求"剪辑视频"、"剪干净"、"去废话"、"删掉静音"、"精剪"、"剪掉重复"、"剪辑口播"时调用。

与 compose_video 的区别：
- compose_video：将多张图片合成视频（图片→视频）
- smart_clip：对已有视频进行智能剪辑（去废话/静音/重复）

支持 4 种模式：
- auto：自动检测静音+口水词+重复（推荐）
- silence_only：仅去静音（速度最快，消耗最低）
- by_description：用自然语言描述要保留/删除的内容（如"只保留产品介绍部分"）
- by_time_ranges：手动指定删除时间段`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: '视频 URL（支持 mp4、mov、avi 等格式，需要可公开访问）',
      },
      mode: {
        type: 'string',
        enum: ['auto', 'silence_only', 'by_description', 'by_time_ranges'],
        description: '剪辑模式。auto(智能分析), silence_only(仅去静音), by_description(按描述), by_time_ranges(按时间)。默认 auto',
      },
      description: {
        type: 'string',
        description: '当 mode=by_description 时，用自然语言描述要保留/删除的内容。例如："只保留产品功能介绍，删掉闲聊"',
      },
      timeRanges: {
        type: 'array',
        description: '当 mode=by_time_ranges 时，指定要删除的时间段列表',
        items: {
          type: 'object',
          properties: {
            start: { type: 'number', description: '开始时间（秒）' },
            end: { type: 'number', description: '结束时间（秒）' },
          },
          required: ['start', 'end'],
        },
      },
      silenceThreshold: {
        type: 'number',
        description: '静音检测阈值（dB），默认 -30。数值越低越不敏感',
      },
      minSilenceDuration: {
        type: 'number',
        description: '最小静音持续时长（秒），默认 2.0',
      },
      removeFillers: {
        type: 'boolean',
        description: '是否去除口水词（嗯、啊、那个等），默认 true',
      },
      removeRepetition: {
        type: 'boolean',
        description: '是否去除重复语句，默认 true',
      },
    },
    required: ['videoUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const mode = (params.mode as ClipMode) || 'auto';
    const description = params.description as string | undefined;
    const timeRanges = params.timeRanges as Array<{ start: number; end: number }> | undefined;
    const silenceThreshold = (params.silenceThreshold as number) || -30;
    const minSilenceDuration = (params.minSilenceDuration as number) || 2.0;
    const removeFillers = params.removeFillers !== false;
    const removeRepetition = params.removeRepetition !== false;

    const dir = getTempDir('agent-smart-clip');

    try {
      // 1. 分析
      const analysis = await runAnalyzePipeline(
        videoUrl, dir, 'clip',
        {
          mode,
          description,
          timeRanges,
          silenceThreshold,
          minSilenceDuration,
          removeFillers,
          removeRepetition,
        }
      );

      if (!analysis.segments || analysis.segments.length === 0) {
        return { success: false, output: '', error: '分析未产生任何分段结果' };
      }

      const keepSegments = analysis.segments.filter((s) => s.recommendation === 'keep');
      const cutSegments = analysis.segments.filter((s) => s.recommendation === 'cut');

      // 2. 执行剪辑
      const finalPath = await executeClip(
        analysis.videoPath,
        analysis.segments.map((s) => ({
          start: s.start, end: s.end,
          action: s.recommendation === 'keep' ? 'keep' : 'cut',
        })),
        dir,
      );

      // 3. 上传
      const supabase = createAdminClient();
      const videoBuffer = readFileSync(finalPath);
      const storageKey = `smart-clip/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, videoBuffer, { contentType: 'video/mp4', upsert: false });
      if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
      const publicUrl = urlData.publicUrl;

      // 4. 保存到灵感库
      const keepDuration = keepSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
      if (ctx.userId) {
        saveMediaToInspiration(
          ctx.userId, 'video',
          `智能剪辑 ${analysis.videoDuration.toFixed(0)}s → ${keepDuration.toFixed(0)}s`,
          [publicUrl],
          { toolName: 'smart_clip' }
        ).catch(() => {});
      }

      // 5. 清理
      try { cleanupTempDir(dir); } catch {}

      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
      const reduction = analysis.videoDuration > 0
        ? ((1 - keepDuration / analysis.videoDuration) * 100).toFixed(0)
        : '0';

      return {
        success: true,
        output: [
          `智能剪辑完成！`,
          ``,
          `📹 **视频链接**: ${publicUrl}`,
          `⏱ **原时长**: ${analysis.videoDuration.toFixed(0)}秒 → **剪辑后**: ${keepDuration.toFixed(0)}秒（精简 ${reduction}%）`,
          `✂️ **删除段数**: ${cutSegments.length}（静音/口水词/重复）`,
          `✅ **保留段数**: ${keepSegments.length}`,
          `🎯 **模式**: ${mode === 'auto' ? '智能分析' : mode === 'silence_only' ? '仅去静音' : mode === 'by_description' ? '按描述' : '按时间'}`,
          `📦 **大小**: ${sizeMB} MB`,
          ``,
          `已自动保存到灵感库。`,
        ].join('\n'),
        data: {
          videoUrl: publicUrl,
          storageKey,
          originalDuration: analysis.videoDuration,
          clippedDuration: keepDuration,
          reductionPercent: parseInt(reduction),
          keepCount: keepSegments.length,
          cutCount: cutSegments.length,
          mode,
          sizeBytes: videoBuffer.length,
          autoSaved: true,
        },
      };
    } catch (e) {
      try { cleanupTempDir(dir); } catch {}
      return {
        success: false,
        output: '',
        error: `智能剪辑失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
