// 批量生图 API (V2.0.1)
// POST /api/ai/image/batch
// Body: { items: [{ prompt, params? }], priority?, presetId? }
// Response: { success, data: { batchId, taskIds, total } }

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { enqueueBatch } from '@/lib/jobs/queue';
import { logAiUsage } from '@/lib/ai-services';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import type { EnqueueBatchItem } from '@/lib/jobs/queue';

export const dynamic = 'force-dynamic';

const MAX_ITEMS_PER_BATCH = 50;

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { items, priority } = body as {
    items?: EnqueueBatchItem[];
    priority?: number;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return createApiError('items 不能为空', 400);
  }
  if (items.length > MAX_ITEMS_PER_BATCH) {
    return createApiError(`单批最多 ${MAX_ITEMS_PER_BATCH} 个任务,收到 ${items.length}`, 400);
  }
  if (priority !== undefined && (priority < 1 || priority > 10)) {
    return createApiError('priority 必须在 1-10', 400);
  }

  // 校验每个 item 必填 prompt
  for (let i = 0; i < items.length; i++) {
    if (!items[i]?.prompt || typeof items[i].prompt !== 'string') {
      return createApiError(`items[${i}].prompt 不能为空`, 400);
    }
    if (items[i].prompt.length > 2000) {
      return createApiError(`items[${i}].prompt 超过 2000 字符`, 400);
    }
  }

  const creditCost = items.length * CREDIT_COSTS.ai_image.perImage;
  try {
    await consume(user.id, creditCost, 'ai_image', `AI 批量生图 ${items.length} 张`, { count: items.length });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
        { status: 402 }
      );
    }
    throw e;
  }

  try {
    const result = await enqueueBatch({
      userId: user.id,
      taskType: 'image_batch',
      items,
      priority,
      estimatedSeconds: 12,
    });

    // 配额预估（Phase 1.6 真正接 quota.ts，本期先记 N 次）
    try {
      await logAiUsage(user.id, 'image', 100 * items.length);
    } catch (e: any) {
      console.warn('[image/batch] logAiUsage 失败:', e.message);
    }

    return createApiResponse({
      batchId: result.batchId,
      taskIds: result.taskIds,
      total: result.total,
      estimatedSeconds: result.total * 12,
    }, `已提交 ${result.total} 个图片任务`);
  } catch (e: any) {
    console.error('[image/batch] enqueueBatch 失败:', e);
    return createApiError(e.message || '提交失败', 500);
  }
});
