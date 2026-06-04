// FFmpeg 视频合并 API — 拼接 + BGM + 字幕 + 自动保存到作品
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import {
  downloadVideo,
  mergeVideoSegments,
  extractThumbnail,
  getTempDir,
  cleanupTempDir,
  type StoryboardScene as FfmpegScene,
} from '@/lib/ffmpeg-utils';
import { readFileSync, statSync } from 'fs';
import { recommendBgmAuto, type BgmStyle } from '@/lib/bgm-recommender';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const dynamic = 'force-dynamic';

// 上传文件到 Supabase Storage
async function uploadToStorage(
  localPath: string,
  userId: string,
  fileName: string
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const buffer = readFileSync(localPath);
    const storagePath = `videos/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(storagePath, buffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Merge] 上传存储失败:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (e) {
    console.error('[Merge] 上传异常:', e);
    return null;
  }
}

// 保存作品记录（自动保存到 content_items）
async function saveVideoWork(
  userId: string,
  videoUrl: string,
  thumbnailUrl: string | null,
  metadata: {
    storyboard: FfmpegScene[];
    bgmStyle: string;
    subtitleStyle: string;
    subtitlePosition: string;
    duration: number;
    stylePreset?: string;
    language?: string;
    topic?: string;
  }
): Promise<void> {
  const supabase = createAdminClient();
  const title = metadata.storyboard
    .map((s) => s.subtitle || '')
    .filter(Boolean)
    .join(' | ')
    .substring(0, 100) || 'AI 生成视频';

  const bgmLabel: Record<string, string> = { tech: '科技电子', chill: '治愈放松', hype: '爆款激昂' };

  // 分镜详情（每段一行）
  const sceneLines = metadata.storyboard.map((s, i) =>
    `段${i + 1}(${s.duration}s): ${s.subtitle || '(无字幕)'}\n  Prompt: ${((s as any).visualPrompt || '').substring(0, 60)}...`
  ).join('\n');

  const summaryParts = [
    metadata.stylePreset ? `风格: ${metadata.stylePreset}` : '',
    `时长: ${metadata.duration}秒 · ${metadata.storyboard.length}段`,
    `BGM: ${bgmLabel[metadata.bgmStyle] || metadata.bgmStyle}`,
    `字幕: ${metadata.subtitleStyle} · ${metadata.subtitlePosition}`,
    metadata.topic ? `主题: ${metadata.topic}` : '',
    metadata.language ? `语言: ${metadata.language}` : '',
    '',
    sceneLines,
  ];
  const summary = summaryParts.filter(Boolean).join('\n');

  const insertData: Record<string, unknown> = {
    user_id: userId,
    type: 'video',
    title,
    original_text: JSON.stringify({
      storyboard: metadata.storyboard.map((s) => ({
        index: s.index, duration: s.duration,
        visualPrompt: (s as any).visualPrompt || '',
        subtitle: s.subtitle || '',
      })),
      config: {
        bgmStyle: metadata.bgmStyle,
        subtitleStyle: metadata.subtitleStyle,
        subtitlePosition: metadata.subtitlePosition,
        stylePreset: metadata.stylePreset || '',
        language: metadata.language || 'zh',
        topic: metadata.topic || '',
      },
    }),
    ai_summary: summary,
    media_urls: [videoUrl],
    source_platform: 'ai_video',
    status: 'active',
    analysis_status: 'completed',
  };
  if (thumbnailUrl) {
    insertData.thumbnail_url = thumbnailUrl;
  }

  const { error } = await supabase.from('content_items').insert(insertData);
  if (error) {
    console.error('[Merge] 保存作品失败:', error.message, error.details);
    throw new Error(`保存作品失败: ${error.message}`);
  }
  console.log(`[Merge] 作品已保存: ${title}`);
}

export const POST = withAuth(async ({ request, user }) => {
  try {
    const {
      videoUrls,
      bgmStyle,
      subtitleStyle,
      subtitlePosition,
      storyboard,
      stylePreset,
      language,
      topic,
    } = await request.json();

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return createApiError('请提供视频链接列表', 400);
    }

    const creditCost = CREDIT_COSTS.ai_video_post.merge;
    try {
      await consume(user.id, creditCost, 'ai_video_merge', `视频合并 ${videoUrls.length} 段`, { segmentCount: videoUrls.length, bgmStyle });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    // BGM auto 模式: 根据 topic/stylePreset 智能推荐风格
    let actualBgmStyle: BgmStyle | string = bgmStyle || 'tech';
    let bgmRecommendNote: string | null = null;
    if (bgmStyle === 'auto') {
      const recommended = recommendBgmAuto({
        topic: topic || '',
        style: stylePreset || '',
      });
      actualBgmStyle = recommended;
      bgmRecommendNote = `根据「${topic || stylePreset || '主题'}」自动推荐: ${recommended}`;
      console.log(`[Merge] BGM auto → ${recommended}`);
    }

    const dir = getTempDir('merge');
    console.log(`[Merge] 开始合并 ${videoUrls.length} 个视频片段, 临时目录: ${dir}`);

    // 1. 下载所有视频到本地
    const localPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = `${dir}/segment_${i}.mp4`;
      try {
        await downloadVideo(videoUrls[i], localPath);
        localPaths.push(localPath);
        console.log(`[Merge] 下载完成: segment_${i}.mp4`);
      } catch (e) {
        console.error(`[Merge] 下载 segment_${i} 失败:`, e);
        cleanupTempDir(dir);
        return createApiError(`下载视频片段 ${i} 失败`, 500);
      }
    }

    // 2. ffmpeg 合并 + BGM + 字幕
    let finalPath: string;
    try {
      finalPath = await mergeVideoSegments({
        segmentPaths: localPaths,
        bgmStyle: actualBgmStyle as any,
        subtitleStyle: subtitleStyle || '白色粗体',
        subtitlePosition: subtitlePosition || '底部',
        storyboard: (storyboard || []) as FfmpegScene[],
        outputDir: dir,
      });
    } catch (e: any) {
      console.error('[Merge] ffmpeg 处理失败:', e);
      cleanupTempDir(dir);
      await refund(user.id, creditCost, 'ai_video_merge', '视频合并处理失败退点', { error: e?.message }).catch(() => {});
      return createApiError(`视频合并失败: ${e.message || '未知错误'}`, 500);
    }

    // 3. 提取封面缩略图
    let thumbnailUrl: string | null = null;
    const thumbPath = `${dir}/thumb.jpg`;
    try {
      extractThumbnail(finalPath, thumbPath);
      const thumbName = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
      thumbnailUrl = await uploadToStorage(thumbPath, user.id, thumbName);
    } catch (e) {
      console.warn('[Merge] 缩略图提取失败，跳过:', e);
    }

    // 4. 上传到 Supabase Storage
    const fileSize = statSync(finalPath).size;
    const fileName = `video_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;
    const publicUrl = await uploadToStorage(finalPath, user.id, fileName);

    if (!publicUrl) {
      cleanupTempDir(dir);
      await refund(user.id, creditCost, 'ai_video_merge', '视频上传存储失败退点', {}).catch(() => {});
      return createApiError('视频上传存储失败，请重试', 500);
    }

    // 5. 保存作品记录（自动保存）
    const totalDuration = (storyboard || []).reduce(
      (sum: number, s: FfmpegScene) => sum + (s.duration || 0),
      0
    );
    try {
      await saveVideoWork(user.id, publicUrl, thumbnailUrl, {
        storyboard: (storyboard || []) as FfmpegScene[],
        bgmStyle: bgmStyle || 'tech',
        subtitleStyle: subtitleStyle || '白色粗体',
        subtitlePosition: subtitlePosition || '底部',
        duration: totalDuration,
        stylePreset: stylePreset || '',
        language: language || 'zh',
        topic: topic || '',
      });
    } catch (saveErr: any) {
      console.error('[Merge] 作品保存失败（视频已上传）:', saveErr.message);
      // 视频已上传成功，作品保存失败不阻塞响应
    }

    // 清理临时文件
    cleanupTempDir(dir);

    console.log(`[Merge] 合并完成, 文件: ${(fileSize / 1024 / 1024).toFixed(1)}MB, URL: ${publicUrl}`);

    return createApiResponse({
      videoUrl: publicUrl,
      size: fileSize,
      saved: true,
      bgmStyle: actualBgmStyle,
      bgmRecommendNote,
    }, '视频合并完成，已自动保存');
  } catch (error) {
    console.error('Video merge error:', error);
    return createApiError('视频合并失败', 500);
  }
});
