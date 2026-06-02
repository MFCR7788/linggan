// 查批次进度 API (V2.0.1)
// GET /api/jobs/[batchId]
// Response: { success, data: BatchProgress }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { getBatchProgress, cancelBatch } from '@/lib/jobs/queue';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params, user }) => {
  const { batchId } = params;
  if (!batchId) return createApiError('batchId 必填', 400);

  const progress = await getBatchProgress(batchId);
  if (!progress) return createApiError('批次不存在', 404);

  // 安全：只能查自己的批次
  const belongsToUser = progress.tasks.some((t) => t.user_id === user.id);
  if (!belongsToUser) return createApiError('无权限', 403);

  return createApiResponse(progress);
});

export const DELETE = withAuth(async ({ params, user }) => {
  const { batchId } = params;
  if (!batchId) return createApiError('batchId 必填', 400);

  // 先校验所有权
  const progress = await getBatchProgress(batchId);
  if (!progress) return createApiError('批次不存在', 404);
  const belongsToUser = progress.tasks.some((t) => t.user_id === user.id);
  if (!belongsToUser) return createApiError('无权限', 403);

  const cancelled = await cancelBatch(batchId);
  return createApiResponse({ cancelled }, `已取消 ${cancelled} 个任务`);
});
