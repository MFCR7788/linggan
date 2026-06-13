// 数字人视频合并 — 多段拼接为单视频
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { downloadVideo, concatVideos, getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { readFileSync } from 'fs';
import { join } from 'path';
import { saveWorkHistory } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withAuth(async ({ request, user }) => {
  let tempDir: string | null = null;

  try {
    const { videoUrls } = await request.json();

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length < 2) {
      return createApiError('请提供至少 2 个视频 URL', 400);
    }

    if (videoUrls.length > 10) {
      return createApiError('最多合并 10 段视频', 400);
    }

    // 下载所有视频到临时目录
    tempDir = getTempDir('dh-merge');
    const localPaths: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = join(tempDir, `segment_${i}.mp4`);
      await downloadVideo(videoUrls[i], localPath);
      localPaths.push(localPath);
    }

    // 拼接
    const mergedPath = join(tempDir, 'merged.mp4');
    await concatVideos(localPaths, mergedPath);

    // 上传到 Supabase
    const buffer = readFileSync(mergedPath);
    const storageName = `digital-human/${user.id}/${Date.now()}-merged.mp4`;

    const supabase = createAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from('lingji-media')
      .upload(storageName, buffer, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (uploadErr) {
      console.error('[dh-merge] 上传失败:', uploadErr);
      return createApiError('合并视频上传失败', 500);
    }

    const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageName);
    const mergedUrl = urlData.publicUrl;

    await saveWorkHistory(user.id, `数字人视频 · ${videoUrls.length} 段`, {
      source_platform: 'ai_digital_human',
      generatedVideo: {
        videoUrl: mergedUrl,
        segmentCount: videoUrls.length,
      },
    });

    return createApiResponse({ videoUrl: mergedUrl, segmentCount: videoUrls.length }, '视频合并完成');
  } catch (err: any) {
    console.error('[dh-merge] 合并失败:', err);
    return createApiError(err.message || '视频合并失败', 500);
  } finally {
    if (tempDir) cleanupTempDir(tempDir);
  }
});
