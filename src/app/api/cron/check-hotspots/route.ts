// 后台定时热点检查 - 供外部定时服务调用
// 异步模式：收到请求立即返回 202，后台执行检查
import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { getCronSecret } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expectedSecret = getCronSecret();
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置,拒绝执行', 500);
  }
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return createApiError('Unauthorized', 401);
  }

  console.log('[Cron] Hotspot check triggered via HTTP, starting in background...');

  // 后台异步执行，不阻塞 HTTP 响应
  (async () => {
    const startTime = Date.now();
    try {
      const { runHotspotCheck } = await import('@/lib/jobs/hotspot-checker');
      const result = await runHotspotCheck();
      const duration = Date.now() - startTime;
      console.log(`[Cron] Hotspot check completed in ${duration}ms: ${result.newCount} new, ${result.errors.length} errors, ${result.processedGroups}/${result.processedGroups + result.remainingGroups} groups`);
    } catch (error) {
      console.error('[Cron] Hotspot check failed:', error);
    }
  })();

  // 立即返回，不等待完成
  return NextResponse.json({
    success: true,
    message: '热点检查已在后台启动',
    timestamp: new Date().toISOString(),
  }, { status: 202 });
}
