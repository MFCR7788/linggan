// 批量数字人 API
// POST /api/digital-human/batch
// Body: {
//   tasks: Array<{ imageUrl, audioUrl, script?, voice? }>
// }
// Response: { batchId, taskIds }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { enqueueBatch, getBatchProgress } from '@/lib/jobs/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_TASKS = 20;

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { tasks } = body as {
    tasks?: Array<{ imageUrl: string; audioUrl: string; script?: string; voice?: string; inspirationId?: string }>;
  };

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return createApiError('tasks 必填(非空数组)', 400);
  }
  if (tasks.length > MAX_TASKS) {
    return createApiError(`单批最多 ${MAX_TASKS} 个任务`, 400);
  }
  for (const t of tasks) {
    if (!t.imageUrl || !t.audioUrl) {
      return createApiError('每个任务需 imageUrl + audioUrl', 400);
    }
  }

  // 入队
  const result = await enqueueBatch({
    userId: user.id,
    taskType: 'digital_human_batch',
    items: tasks.map((t) => ({
      prompt: t.script || '数字人视频',
      params: {
        imageUrl: t.imageUrl,
        audioUrl: t.audioUrl,
        script: t.script,
        voice: t.voice,
        inspirationId: t.inspirationId,
      },
    })),
    priority: 6,
  });

  return createApiResponse(
    { batchId: result.batchId, taskIds: result.taskIds },
    `已提交 ${tasks.length} 个任务到队列`
  );
});

export const GET = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const batchId = url.searchParams.get('batchId');
  if (!batchId) return createApiError('batchId 必填', 400);

  const progress = await getBatchProgress(batchId);
  if (!progress) return createApiError('批次不存在', 404);

  // 验证 ownership(所有任务的 user_id 必须匹配)
  const allOwned = progress.tasks.every((t: any) => t.user_id === user.id);
  if (!allOwned) return createApiError('无权限', 403);

  return createApiResponse(progress);
});
