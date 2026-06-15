// AI 封面生成器 Agent Tool — 智能选帧 + 标题 + 合成
// 底层引擎: cover-generator.ts (FFmpeg + sharp + DeepSeek LLM)

import type { ToolDefinition } from '../../types';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { saveMediaToInspiration } from '../save-media-helper';
import { generateCover } from '@/lib/ai/cover-generator';
import { join } from 'path';
import { writeFileSync } from 'fs';

export const coverGeneratorTool: ToolDefinition = {
  name: 'cover_generator',
  description: `从视频中智能提取最佳帧，生成带标题的封面图。
使用场景：当用户要求"生成封面"、"做封面图"、"视频封面"、"封面设计"时调用。

支持 4 种封面模板：
- 大字报：竖排大字，高对比，标题占满中央
- 上下分割：上图下标题布局
- 左右分割：左图右标题布局
- 居中贴纸：标题半透明圆角底色叠在图中央

支持 4 种标题风格：悬念/数字/痛点/对比`,
  isLongRunning: true,
  parameters: {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: '视频 URL（支持 mp4、mov 等格式，需要可公开访问）',
      },
      titleStyle: {
        type: 'string',
        enum: ['悬念', '数字', '痛点', '对比'],
        description: '标题风格。默认 悬念',
      },
      coverStyle: {
        type: 'string',
        enum: ['大字报', '上下分割', '左右分割', '居中贴纸'],
        description: '封面模板。默认 大字报',
      },
      customTitle: {
        type: 'string',
        description: '自定义标题（留空则 AI 自动生成）',
      },
      description: {
        type: 'string',
        description: '视频内容描述（用于 AI 生成标题）',
      },
    },
    required: ['videoUrl'],
  },
  async handler(params, ctx) {
    const videoUrl = params.videoUrl as string;
    const titleStyle = (params.titleStyle as '悬念' | '数字' | '痛点' | '对比') || '悬念';
    const coverStyle = (params.coverStyle as '大字报' | '上下分割' | '左右分割' | '居中贴纸') || '大字报';
    const customTitle = params.customTitle as string | undefined;
    const description = params.description as string | undefined;

    const dir = getTempDir('agent-cover');

    try {
      // 1. 下载视频
      const resp = await fetch(videoUrl);
      if (!resp.ok) throw new Error(`下载视频失败 HTTP ${resp.status}`);
      const videoBuf = Buffer.from(await resp.arrayBuffer());
      const videoPath = join(dir, 'source.mp4');
      writeFileSync(videoPath, videoBuf);

      // 2. 生成封面（抽帧 + 评分 + AI 标题 + 合成）
      const result = await generateCover(videoPath, dir, {
        titleStyle,
        coverStyle,
        customTitle,
        description: description || customTitle || '精彩内容',
      });

      // 3. 上传封面
      const supabase = createAdminClient();
      const storageKey = `covers/${ctx.userId || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, result.coverBuffer, { contentType: 'image/png', upsert: false });
      if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
      const publicUrl = urlData.publicUrl;

      // 4. 保存到灵感库
      const title = customTitle || result.titles[0] || 'AI 封面';
      if (ctx.userId) {
        saveMediaToInspiration(
          ctx.userId, 'image',
          `封面: ${title}`,
          [publicUrl],
          { toolName: 'cover_generator' }
        ).catch(() => {});
      }

      // 5. 清理
      try { cleanupTempDir(dir); } catch {}

      const topFrames = result.keyframes.slice(0, 3).map((k, i) =>
        `${i + 1}. 帧(score=${k.score})`
      ).join('\n');

      return {
        success: true,
        output: [
          `封面生成完成！`,
          ``,
          `🖼️ **封面图**: ${publicUrl}`,
          `🎨 **模板**: ${coverStyle}`,
          `📝 **标题**: ${title}`,
          `📊 **最佳帧评分**:`,
          topFrames,
          result.titles.length > 1 ? `💡 **备选标题**: ${result.titles.slice(1, 3).join(' / ')}` : '',
          ``,
          `已自动保存到灵感库。`,
        ].filter(Boolean).join('\n'),
        data: {
          coverUrl: publicUrl,
          storageKey,
          title,
          coverStyle,
          titleStyle,
          candidateTitles: result.titles,
          keyframes: result.keyframes.slice(0, 3).map(k => ({ score: k.score, sharpness: k.sharpness, contrast: k.contrast })),
          autoSaved: true,
        },
      };
    } catch (e) {
      try { cleanupTempDir(dir); } catch {}
      return {
        success: false,
        output: '',
        error: `封面生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
