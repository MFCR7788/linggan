// 智能切片 Agent Tool — 长视频 → 多个精华短视频
// 底层引擎: smart-clip-engine.ts (FFmpeg + FunASR + DeepSeek LLM)

import type { ToolDefinition } from '../../types';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { saveMediaToInspiration } from '../save-media-helper';
import { runAnalyzePipeline, executeSlice } from '@/lib/ai/smart-clip-engine';
import type { SliceMode } from '@/lib/ai/smart-clip-engine';
import { readFileSync } from 'fs';

export const smartSliceTool: ToolDefinition = {
  name: 'smart_slice',
  description: `将长视频智能切片为多个精华短视频。适用于直播回放、长教程、产品讲解等场景。
使用场景：当用户要求"视频切片"、"把直播剪成短视频"、"提取精华片段"、"拆分长视频"、"直播切片"时调用。

支持 5 种模式：
- product：AI 识别产品讲解段落，提取为独立短视频
- highlight：提取精彩/高能片段（长句子、感叹、互动等）
- topic：按语义话题智能拆分
- uniform：按固定时长均匀切分
- custom：按关键词匹配切分`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: '视频 URL（支持 mp4、mov、avi 等格式，需要可公开访问）',
      },
      sliceMode: {
        type: 'string',
        enum: ['product', 'highlight', 'topic', 'uniform', 'custom'],
        description: '切片模式。product(产品讲解), highlight(高能片段), topic(话题分割), uniform(均分), custom(关键词)。默认 product',
      },
      keywords: {
        type: 'array',
        description: '当 sliceMode=custom 或 product 时使用。自定义关键词，匹配包含这些词的片段',
        items: { type: 'string' },
      },
      sliceDuration: {
        type: 'object',
        description: '当 sliceMode=uniform 时，指定每段时长范围（秒）',
        properties: {
          min: { type: 'number', description: '最小时长（秒），默认 15' },
          max: { type: 'number', description: '最大时长（秒），默认 60' },
        },
      },
    },
    required: ['videoUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const sliceMode = (params.sliceMode as SliceMode) || 'product';
    const keywords = (params.keywords as string[]) || [];
    const sliceDuration = (params.sliceDuration as { min: number; max: number }) || { min: 15, max: 60 };

    const dir = getTempDir('agent-smart-slice');

    try {
      // 1. 分析
      const analysis = await runAnalyzePipeline(
        videoUrl, dir, 'slice',
        {
          mode: sliceMode,
          keywords,
          sliceDuration,
        }
      );

      if (!analysis.slices || analysis.slices.length === 0) {
        return { success: false, output: '', error: '未识别到可切片的内容' };
      }

      const enabledSlices = analysis.slices.filter((s) => s.enabled);

      // 2. 执行切片
      const outputPaths = await executeSlice(
        analysis.videoPath,
        analysis.slices,
        dir,
      );

      // 3. 上传每个切片
      const supabase = createAdminClient();
      const sliceResults: Array<{
        title: string; url: string; duration: number; sizeBytes: number;
      }> = [];

      for (let i = 0; i < outputPaths.length; i++) {
        const buf = readFileSync(outputPaths[i]);
        const storageKey = `smart-slice/${ctx.userId || 'anon'}/${Date.now()}-${i}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from('lingji-media')
          .upload(storageKey, buf, { contentType: 'video/mp4', upsert: false });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
          sliceResults.push({
            title: analysis.slices[i]?.title || `切片 ${i + 1}`,
            url: urlData.publicUrl,
            duration: analysis.slices[i]?.end - analysis.slices[i]?.start || 0,
            sizeBytes: buf.length,
          });
        }
      }

      // 4. 保存到灵感库
      if (ctx.userId && sliceResults.length > 0) {
        const totalDuration = sliceResults.reduce((sum, s) => sum + s.duration, 0);
        saveMediaToInspiration(
          ctx.userId, 'video',
          `智能切片 ${analysis.videoDuration.toFixed(0)}s → ${sliceResults.length}个片段 ${totalDuration.toFixed(0)}s`,
          sliceResults.map((s) => s.url),
          { toolName: 'smart_slice' }
        ).catch(() => {});
      }

      // 5. 清理
      try { cleanupTempDir(dir); } catch {}

      const totalDuration = sliceResults.reduce((sum, s) => sum + s.duration, 0);
      const totalSizeMB = (sliceResults.reduce((sum, s) => sum + s.sizeBytes, 0) / 1024 / 1024).toFixed(1);
      const modeLabel = sliceMode === 'product' ? '产品讲解' : sliceMode === 'highlight' ? '高能片段' : sliceMode === 'topic' ? '话题分割' : sliceMode === 'uniform' ? '均分' : '关键词';

      const listText = sliceResults.map((s, i) =>
        `${i + 1}. **${s.title}** — ${s.duration.toFixed(0)}秒\n   ${s.url}`
      ).join('\n');

      return {
        success: true,
        output: [
          `智能切片完成！从 ${analysis.videoDuration.toFixed(0)}秒 视频中提取 ${sliceResults.length} 个精华片段。`,
          ``,
          `🎯 **模式**: ${modeLabel}`,
          `⏱ **总时长**: ${totalDuration.toFixed(0)}秒`,
          `📦 **总大小**: ${totalSizeMB} MB`,
          ``,
          `📋 **切片列表**:`,
          listText,
          ``,
          `已自动保存到灵感库。`,
        ].join('\n'),
        data: {
          slices: sliceResults,
          totalDuration,
          totalSizeBytes: sliceResults.reduce((sum, s) => sum + s.sizeBytes, 0),
          sliceCount: sliceResults.length,
          originalDuration: analysis.videoDuration,
          mode: sliceMode,
          autoSaved: true,
        },
      };
    } catch (e) {
      try { cleanupTempDir(dir); } catch {}
      return {
        success: false,
        output: '',
        error: `智能切片失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
