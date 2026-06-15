// AI 混剪 — 执行端点（素材下载 + FFmpeg 合成）
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { analyzeClips, compositeMashup } from '@/lib/ai/mashup-engine';
import { emitProgress, registerTask } from '@/lib/ai/smart-clip-progress';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { consume } from '@/lib/credits';
import { readFileSync } from 'fs';
import type { MashupRatio, BgmStyle } from '@/lib/ai/mashup-engine';

export const maxDuration = 300;

interface ExecuteBody {
  taskId: string;
  videoUrls: string[];
  arrangements: Array<{
    clipIndex: number;
    startTime: number;
    duration: number;
    transition: 'hard' | 'fade' | 'slide_left' | 'slide_right' | 'zoom';
    order: number;
  }>;
  ratio?: MashupRatio;
  bgm?: BgmStyle;
  bgmVolume?: number;
  totalDuration?: number;
  bgmStyle?: BgmStyle;
}

export const POST = withAuth(async ({ request, user }) => {
  const body: ExecuteBody = await request.json();
  const { taskId, videoUrls, arrangements, ratio = '9:16', bgm, bgmVolume } = body;

  if (!taskId) return createApiError('缺少 taskId', 400);
  if (!videoUrls || videoUrls.length < 2) return createApiError('请提供至少 2 个视频素材', 400);
  if (!arrangements || arrangements.length === 0) return createApiError('缺少编排方案', 400);

  // 扣点
  try {
    await consume(user.id, 5, 'mashup', 'AI 混剪');
  } catch (creditErr) {
    const msg = creditErr instanceof Error ? creditErr.message : '';
    if (msg.includes('Insufficient') || msg.includes('余额不足') || msg.includes('点数不足')) {
      return createApiResponse({ code: 'INSUFFICIENT_CREDITS', required: 5 }, '余额不足');
    }
    throw creditErr;
  }

  registerTask(taskId);
  emitProgress(taskId, { type: 'progress', step: '准备执行', percent: 0 });

  const dir = getTempDir('mashup-exec');

  try {
    // 1. 下载素材
    emitProgress(taskId, { type: 'progress', step: '下载素材', percent: 5 });
    const clips = await analyzeClips(videoUrls, dir, (step, pct) => {
      emitProgress(taskId, { type: 'progress', step, percent: 5 + pct * 0.2 });
    });

    // 2. 合成
    const outputPath = await compositeMashup(
      clips,
      {
        arrangements: arrangements.map((a) => ({
          ...a,
          transition: a.transition || 'hard',
        })),
        totalDuration: arrangements.reduce((s, a) => s + a.duration, 0),
        bgmStyle: bgm || 'auto' as BgmStyle,
        hasSubtitles: false,
        summary: '',
      },
      dir,
      { ratio, bgm, bgmVolume },
      (step, pct) => emitProgress(taskId, { type: 'progress', step, percent: 25 + pct * 0.6 }),
    );

    // 3. 上传
    emitProgress(taskId, { type: 'progress', step: '上传中', percent: 90 });
    const supabase = createAdminClient();
    const buf = readFileSync(outputPath);
    const storageKey = `mashup/${user.id}/${Date.now()}.mp4`;
    const { error: uploadErr } = await supabase.storage
      .from('lingji-media')
      .upload(storageKey, buf, { contentType: 'video/mp4', upsert: false });
    if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);

    const totalDuration = arrangements.reduce((s, a) => s + a.duration, 0);
    emitProgress(taskId, {
      type: 'complete', step: '完成', percent: 100,
      result: {
        videoUrl: urlData.publicUrl,
        totalDuration,
        clipCount: videoUrls.length,
        segmentCount: arrangements.length,
        storageKey,
      },
    });

    return createApiResponse({ taskId, streamUrl: `/api/mashup/stream?taskId=${taskId}` });
  } catch (e) {
    console.error('[mashup execute] 错误:', e);
    emitProgress(taskId, {
      type: 'error',
      message: e instanceof Error ? e.message : '执行失败',
    });
    return createApiError(`执行失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  } finally {
    setTimeout(() => { try { cleanupTempDir(dir); } catch {} }, 10 * 60 * 1000);
  }
});
