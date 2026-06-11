// Remotion 视频渲染 API
// POST — 按 compositionId + props 渲染视频 → 上传 Supabase Storage → 返回 URL
// 核心逻辑在 src/lib/remotion-render.ts，这里只做 auth + 参数校验

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { renderRemotionRemote } from '@/lib/remotion-render';

const VALID_COMPOSITIONS = ['TikTokShort', 'TitleIntro'] as const;

export const POST = withAuth(async ({ request, user }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiError('请求体 JSON 解析失败', 400);
  }

  const compositionId = body.compositionId as string;
  const props = body.props as Record<string, unknown> | undefined;

  if (!compositionId || !VALID_COMPOSITIONS.includes(compositionId as never)) {
    return createApiError(`无效的模板 ID，可选: ${VALID_COMPOSITIONS.join(', ')}`, 400);
  }

  if (!props || typeof props !== 'object') {
    return createApiError('缺少 props 参数', 400);
  }

  try {
    const result = await renderRemotionRemote({
      compositionId,
      props,
      userId: user.id,
      durationInFrames: body.durationInFrames as number | undefined,
      fps: body.fps as number | undefined,
      outputFormat: (body.format as 'mp4' | 'webm') || 'mp4',
    });

    return createApiResponse(result);
  } catch (err) {
    console.error('[Remotion] render error:', err);
    return createApiError(
      `视频渲染失败: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
});

export const maxDuration = 300; // 5 分钟
