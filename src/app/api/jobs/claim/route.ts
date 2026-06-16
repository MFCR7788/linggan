// Worker 抢占端点 (V2.0.1)
// POST /api/jobs/claim
// 由 cron 每分钟调用（或外部触发器）
// 鉴权：CRON_SECRET 环境变量

import { NextResponse } from 'next/server';
import { runWorker } from '@/lib/jobs/task-worker';
import { getCronSecret } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

const WORKER_ID_PREFIX = 'ecs-cron';

export async function POST(request: Request): Promise<NextResponse> {
  // 1) CRON_SECRET 鉴权（必须配置，不可降级到其他密钥）
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    console.error('[jobs/claim] CRON_SECRET 未配置，拒绝请求');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${cronSecret}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) 可选 limit 参数
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 20);

  // 3) 跑一轮 worker
  const workerId = `${WORKER_ID_PREFIX}-${Date.now()}`;
  const result = await runWorker({ workerId, limit });

  return NextResponse.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
}

// 兼容 GET 调用（便于手动测试）
export async function GET(request: Request): Promise<NextResponse> {
  return POST(request);
}
