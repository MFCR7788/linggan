// 后台定时热点检查 - 供外部定时服务调用
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { runHotspotCheck } from '@/lib/jobs/hotspot-checker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 使用动态 key 访问防止 Next.js build 时内联
  const expectedSecret = process.env['CRON_SECRET'];
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置,拒绝执行', 500);
  }
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== expectedSecret) {
    return createApiError('Unauthorized', 401);
  }

  console.log('[Cron] Starting scheduled hotspot check...');
  const startTime = Date.now();

  try {
    const result = await runHotspotCheck();
    const duration = Date.now() - startTime;

    console.log(`[Cron] Hotspot check completed in ${duration}ms: ${result.newCount} new, ${result.errors.length} errors`);

    return createApiResponse({
      newHotspots: result.newCount,
      errors: result.errors,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, `检查完成：${result.newCount} 条新热点，耗时 ${(duration / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('[Cron] Hotspot check failed:', error);
    return createApiError('热点检查失败', 500);
  }
}
