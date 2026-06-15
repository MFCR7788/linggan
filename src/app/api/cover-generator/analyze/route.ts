// 封面生成器 — 分析端点（提取关键帧 + 生成标题）
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { extractKeyframes, scoreFrames, generateCoverTitles } from '@/lib/ai/cover-generator';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { TitleStyle } from '@/lib/ai/cover-generator';

export const maxDuration = 90;

interface AnalyzeBody {
  videoUrl: string;
  titleStyle?: TitleStyle;
  description?: string;
}

export const POST = withAuth(async ({ request, user }) => {
  const body: AnalyzeBody = await request.json();
  const { videoUrl, titleStyle = '悬念', description } = body;

  if (!videoUrl) return createApiError('请提供 videoUrl', 400);

  const dir = getTempDir('cover-analyze');

  try {
    // 1. 下载视频
    const videoPath = join(dir, 'input.mp4');
    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`视频下载失败 HTTP ${resp.status}`);
    writeFileSync(videoPath, Buffer.from(await resp.arrayBuffer()));

    // 2. 提取 + 评分关键帧
    const framePaths = await extractKeyframes(videoPath, dir);
    const scored = await scoreFrames(framePaths);
    const top3 = scored.slice(0, 3);

    // 3. 上传关键帧到 Supabase
    const supabase = createAdminClient();
    const keyframeUrls: Array<{
      time: number; score: number; url: string;
      sharpness: number; contrast: number; saturation: number;
    }> = [];

    for (let i = 0; i < top3.length; i++) {
      const buf = readFileSync(top3[i].path);
      const storageKey = `covers/${user.id}/${Date.now()}-frame-${i}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(storageKey, buf, { contentType: 'image/jpeg', upsert: false });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
        keyframeUrls.push({
          time: top3[i].time,
          score: top3[i].score,
          url: urlData.publicUrl,
          sharpness: top3[i].sharpness,
          contrast: top3[i].contrast,
          saturation: top3[i].saturation,
        });
      }
    }

    // 4. 生成标题
    let titles: string[] = [];
    if (description) {
      titles = await generateCoverTitles(description, titleStyle, 5);
    }

    cleanupTempDir(dir);

    return createApiResponse({ keyframes: keyframeUrls, titles }, '分析完成');
  } catch (e) {
    try { cleanupTempDir(dir); } catch {}
    console.error('[cover-generator analyze] 错误:', e);
    return createApiError(`分析失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  }
});
