// 后台定时热点检查 - 供外部定时服务调用
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { runHotspotCheck } from '@/lib/jobs/hotspot-checker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // CRON_SECRET 在 Vercel 运行时不可用，用 SUPABASE_SERVICE_ROLE_KEY 替代鉴权
  const expectedSecret = process.env['CRON_SECRET'] || process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!expectedSecret) {
    return createApiError('CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY 未配置,拒绝执行', 500);
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
