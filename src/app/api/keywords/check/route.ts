import { createApiResponse } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { runHotspotCheck } from '@/lib/jobs/hotspot-checker';

export const dynamic = 'force-dynamic';

// 手动触发热点检查
export const POST = withAuth(async () => {
  // 异步执行检查
  const result = await runHotspotCheck();

  return createApiResponse({
    newHotspots: result.newCount,
    errors: result.errors,
  }, `热点检查完成，发现 ${result.newCount} 条新热点`);
});
