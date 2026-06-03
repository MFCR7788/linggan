// 数字人 Animate 角色动作迁移 API
// POST { imageUrl, videoUrl, mode? }              → 提交 Animate 任务
// GET  ?taskId=xxx                                 → 查状态

import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { submitAnimateTask, getAnimateTaskStatus } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user: _user }) => {
  try {
    const { imageUrl, videoUrl, mode = 'animate', resolution = '720P' } = await request.json();

    if (!imageUrl || !videoUrl) {
      return createApiError('缺少必填参数(imageUrl / videoUrl)', 400);
    }

    // URL 合法性粗校验
    if (!/^https?:\/\//.test(imageUrl) || !/^https?:\/\//.test(videoUrl)) {
      return createApiError('imageUrl / videoUrl 需为完整 HTTP(S) URL', 400);
    }

    const result = await submitAnimateTask({
      imageUrl,
      videoUrl,
      mode: mode === 'replace' ? 'replace' : 'animate',
      resolution: resolution === '480P' ? '480P' : '720P',
    });

    if (!result.taskId) {
      return createApiError(result.message, 500);
    }

    return createApiResponse({
      taskId: result.taskId,
      status: result.status,
    }, 'Animate 任务已提交,通常 1-3 分钟');
  } catch (e: any) {
    console.error('[Animate] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
});

export const GET = withAuth(async ({ request, user: _user }) => {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) return createApiError('缺少 taskId', 400);

  const result = await getAnimateTaskStatus(taskId);
  return createApiResponse(result, '状态已获取');
});
