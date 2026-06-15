import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { runAnalyzePipeline } from '@/lib/ai/smart-clip-engine';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import { registerTask, emitProgress, cacheAnalysis } from '@/lib/ai/smart-clip-progress';
import type { ClipMode, SliceMode, Direction } from '@/lib/ai/smart-clip-engine';

export const maxDuration = 120; // 2 分钟，足够分析

interface AnalyzeBody {
  videoUrl: string;
  direction: 'clip' | 'slice';
  clipMode?: ClipMode;
  description?: string;
  timeRanges?: Array<{ start: number; end: number }>;
  sliceMode?: SliceMode;
  sliceDuration?: { min: number; max: number };
  keywords?: string[];
  silenceThreshold?: number;
  minSilenceDuration?: number;
  removeFillers?: boolean;
  removeRepetition?: boolean;
}

export const POST = withAuth(async ({ request }) => {
  let dir: string | null = null;

  try {
    const body: AnalyzeBody = await request.json();
    const { videoUrl, direction = 'clip' } = body;

    if (!videoUrl) {
      return createApiError('请提供 videoUrl', 400);
    }

    // 验证 URL
    if (!/^https?:\/\/.+\.(mp4|mov|avi|mkv|webm|flv)(\?.*)?$/i.test(videoUrl) &&
        !videoUrl.includes('supabase') && !videoUrl.includes('storage')) {
      // 放宽限制，允许 Supabase Storage URL
      if (!/^https?:\/\//.test(videoUrl)) {
        return createApiError('视频链接格式不正确', 400);
      }
    }

    dir = getTempDir('smart-clip-analyze');

    // 预生成 taskId，避免在 onProgress 回调中访问未初始化的 result
    const taskId = crypto.randomUUID();

    const result = await runAnalyzePipeline(
      videoUrl,
      dir,
      direction,
      {
        mode: (direction === 'clip' ? body.clipMode : body.sliceMode) || 'auto',
        description: body.description,
        timeRanges: body.timeRanges,
        keywords: body.keywords,
        sliceDuration: body.sliceDuration,
        silenceThreshold: body.silenceThreshold,
        minSilenceDuration: body.minSilenceDuration,
        removeFillers: body.removeFillers,
        removeRepetition: body.removeRepetition,
      },
      (step, percent) => {
        emitProgress(taskId, { type: 'progress', step, percent });
      }
    );

    // 注册 task + 缓存分析状态（30 分钟 TTL）
    registerTask(taskId);
    cacheAnalysis(taskId, {
      videoPath: result.videoPath,
      audioPath: result.audioPath,
      direction: result.direction,
    });

    // 将分析结果绑定到 taskId（通过 progressBus 传递）
    emitProgress(taskId, {
      type: 'step_complete',
      step: 'analyze_done',
      duration: 0,
      result: {
        direction: result.direction,
        videoDuration: result.videoDuration,
        segments: result.segments,
        slices: result.slices,
        videoPath: result.videoPath,
        audioPath: result.audioPath,
        sentences: result.sentences,
      },
    });

    const stats =
      direction === 'clip' && result.segments
        ? {
            totalSegments: result.segments.length,
            keepCount: result.segments.filter((s) => s.recommendation === 'keep').length,
            cutCount: result.segments.filter((s) => s.recommendation === 'cut').length,
            originalDuration: result.videoDuration,
            estimatedDuration: result.segments
              .filter((s) => s.recommendation === 'keep')
              .reduce((sum, s) => sum + (s.end - s.start), 0),
          }
        : undefined;

    return createApiResponse(
      {
        taskId,
        direction: result.direction,
        videoDuration: result.videoDuration,
        segments: result.segments,
        slices: result.slices,
        stats,
      },
      '分析完成'
    );
  } catch (e) {
    console.error('[smart-clip analyze] 错误:', e);
    return createApiError(
      `分析失败: ${e instanceof Error ? e.message : '未知错误'}`,
      500
    );
  } finally {
    // 保留临时目录给 execute 使用，不在此清理
  }
});
