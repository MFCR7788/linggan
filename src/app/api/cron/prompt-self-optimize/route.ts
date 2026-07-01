// POST /api/cron/prompt-self-optimize — 每日提示词自我优化
// 由 ECS crontab 触发（CRON_SECRET 保护）

import { NextResponse } from 'next/server';
import { runSelfOptimization } from '@/lib/agent/prompt-optimizer/evolution/self-optimizer';
import { getCronSecret } from '@/lib/runtime-config';

export const maxDuration = 60;

export async function POST(request: Request) {
  // CRON_SECRET 鉴权
  const authHeader = request.headers.get('authorization');
  const expectedSecret = getCronSecret();
  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET 未配置' }, { status: 500 });
  }
  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
  }

  try {
    const result = await runSelfOptimization();

    return NextResponse.json({
      success: result.success,
      data: {
        weightAdjustments: result.weightAdjustment?.adjustments ?? 0,
        keywordUpdates: result.keywordUpdate?.updates ?? 0,
        report: result.report ?? null,
        errors: result.errors,
        durationMs: result.durationMs,
      },
    });
  } catch (e) {
    console.error('[PromptSelfOptimize] 执行失败:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '自我优化执行失败' },
      { status: 500 },
    );
  }
}
