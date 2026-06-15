// AI 混剪 — 分析端点（素材分析 + LLM 编排方案）
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { analyzeClips, generateArrangement } from '@/lib/ai/mashup-engine';
import { getTempDir, cleanupTempDir } from '@/lib/ffmpeg-utils';
import type { MashupStyle } from '@/lib/ai/mashup-engine';

export const maxDuration = 120;

interface AnalyzeBody {
  videoUrls: string[];
  goal?: string;
  style?: MashupStyle;
  targetDuration?: number;
}

export const POST = withAuth(async ({ request }) => {
  const body: AnalyzeBody = await request.json();
  const { videoUrls, goal, style = '快节奏', targetDuration } = body;

  if (!videoUrls || videoUrls.length < 2) {
    return createApiError('请提供至少 2 个视频素材', 400);
  }
  if (videoUrls.length > 20) {
    return createApiError('最多 20 段素材', 400);
  }

  const dir = getTempDir('mashup-analyze');

  try {
    // 1. 分析素材
    const clips = await analyzeClips(videoUrls, dir);

    // 2. LLM 编排
    const plan = await generateArrangement(clips, { goal, style, targetDuration });

    // 3. 简化返回（不返回本地路径）
    const clipSummaries = clips.map((c) => ({
      index: c.index,
      duration: c.duration,
      width: c.width,
      height: c.height,
      hasAudio: c.hasAudio,
      videoUrl: c.videoUrl,
    }));

    cleanupTempDir(dir);

    return createApiResponse({
      taskId: crypto.randomUUID(),
      clips: clipSummaries,
      plan: {
        arrangements: plan.arrangements,
        totalDuration: plan.totalDuration,
        bgmStyle: plan.bgmStyle,
        hasSubtitles: plan.hasSubtitles,
        summary: plan.summary,
      },
    }, '编排方案生成成功');
  } catch (e) {
    try { cleanupTempDir(dir); } catch {}
    console.error('[mashup analyze] 错误:', e);
    return createApiError(`分析失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  }
});
