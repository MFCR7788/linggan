import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { executeClip, executeSlice } from '@/lib/ai/smart-clip-engine';
import { emitProgress, registerTask, getAnalysis, clearAnalysis } from '@/lib/ai/smart-clip-progress';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { consume } from '@/lib/credits';
import type { PostProcessOptions } from '@/lib/ai/smart-clip-executor';
import { readFileSync } from 'fs';

export const maxDuration = 300;

interface ExecuteBody {
  taskId: string;
  segments?: Array<{ start: number; end: number; action: 'keep' | 'cut' }>;
  slices?: Array<{ start: number; end: number; enabled: boolean; title?: string }>;
  postProcess?: PostProcessOptions;
}

export const POST = withAuth(async ({ request, user }) => {
  const body: ExecuteBody = await request.json();
  const { taskId, segments, slices, postProcess } = body;

  if (!taskId) return createApiError('缺少 taskId', 400);
  if (!segments && !slices) {
    return createApiError('请提供 segments（剪辑模式）或 slices（切片模式）', 400);
  }

  // 读取分析缓存
  const cached = getAnalysis(taskId);
  if (!cached || !cached.videoPath) {
    return createApiError('分析状态已过期，请重新分析', 410);
  }

  const direction = segments ? 'clip' : 'slice';
  const isRuleBased = direction === 'clip'
    ? segments?.every((s) => s.action === 'keep') // 全是 keep → 只切静音
    : false;
  const creditAmount = isRuleBased ? 1 : 2;

  try {
    await consume(user.id, creditAmount, `smart_${direction}`, direction === 'clip' ? '智能剪辑' : '智能切片');
  } catch (creditErr) {
    const msg = creditErr instanceof Error ? creditErr.message : '';
    if (msg.includes('Insufficient') || msg.includes('余额不足') || msg.includes('点数不足')) {
      return createApiResponse({ code: 'INSUFFICIENT_CREDITS', required: creditAmount }, '余额不足');
    }
    throw creditErr;
  }

  registerTask(taskId);
  emitProgress(taskId, { type: 'progress', step: '准备执行', percent: 0 });

  const execDir = getTempDir('smart-clip-exec');

  try {
    if (direction === 'clip' && segments) {
      const finalPath = await executeClip(
        cached.videoPath, segments, execDir, postProcess,
        (step, percent) => emitProgress(taskId, { type: 'progress', step, percent: 5 + percent * 0.9 })
      );

      emitProgress(taskId, { type: 'progress', step: '上传中', percent: 95 });
      const result = await uploadToSupabase(finalPath, user.id);

      emitProgress(taskId, {
        type: 'complete', step: '完成', percent: 100,
        result: {
          videoUrl: result.publicUrl,
          totalDuration: segments.filter(s => s.action === 'keep')
            .reduce((sum, s) => sum + (s.end - s.start), 0),
          stats: { segmentCount: segments.length, storageKey: result.storageKey },
        },
      });

      clearAnalysis(taskId);
      return createApiResponse({ taskId, streamUrl: `/api/smart-clip/stream?taskId=${taskId}` });
    }

    if (direction === 'slice' && slices) {
      const outputPaths = await executeSlice(
        cached.videoPath, slices, execDir, postProcess,
        (step, percent) => emitProgress(taskId, { type: 'progress', step, percent: 5 + percent * 0.85 })
      );

      emitProgress(taskId, { type: 'progress', step: '上传中', percent: 90 });
      const supabase = createAdminClient();
      const sliceResults: Array<{ title: string; url: string; duration: number; sizeBytes: number }> = [];

      for (let i = 0; i < outputPaths.length; i++) {
        const buf = readFileSync(outputPaths[i]);
        const storageKey = `smart-clip/${user.id}/${Date.now()}-${i}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from('lingji-media')
          .upload(storageKey, buf, { contentType: 'video/mp4', upsert: false });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
          sliceResults.push({
            title: slices[i]?.title || `切片 ${i + 1}`,
            url: urlData.publicUrl,
            duration: slices[i]?.end - slices[i]?.start || 0,
            sizeBytes: buf.length,
          });
        }
      }

      emitProgress(taskId, {
        type: 'complete', step: '完成', percent: 100,
        result: {
          sliceUrls: sliceResults,
          totalDuration: sliceResults.reduce((sum, s) => sum + s.duration, 0),
          count: sliceResults.length,
        },
      });

      clearAnalysis(taskId);
      return createApiResponse({ taskId, streamUrl: `/api/smart-clip/stream?taskId=${taskId}` });
    }

    return createApiError('无效的请求参数', 400);
  } catch (e) {
    console.error('[smart-clip execute] 错误:', e);
    emitProgress(taskId, {
      type: 'error',
      message: e instanceof Error ? e.message : '执行失败',
    });
    return createApiError(`执行失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  } finally {
    setTimeout(() => { try { cleanupTempDir(execDir); } catch {} }, 10 * 60 * 1000);
  }
});

async function uploadToSupabase(filePath: string, userId: string) {
  const supabase = createAdminClient();
  const buf = readFileSync(filePath);
  const storageKey = `smart-clip/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const { error: uploadErr } = await supabase.storage
    .from('lingji-media')
    .upload(storageKey, buf, { contentType: 'video/mp4', upsert: false });
  if (uploadErr) throw new Error(`上传失败: ${uploadErr.message}`);
  const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(storageKey);
  return { publicUrl: urlData.publicUrl, storageKey };
}
