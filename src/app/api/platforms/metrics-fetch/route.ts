// 抓取发布指标的 worker
// 定时(每 6 小时)从已发布平台拉数据,写入 publication_metrics
// 鉴权: CRON_SECRET 头 或 query 参数

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/platforms/registry';
import { decryptTokenUnsafe } from '@/lib/platforms/encryption';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';
import { getCronSecret } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get('authorization') === `Bearer ${secret}`
    || url.searchParams.get('secret') === secret;
}

export async function GET(request: Request) {
  return runFetch(request);
}

export async function POST(request: Request) {
  return runFetch(request);
}

async function runFetch(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  // 拉所有已发布 + 自动平台的发布记录
  const { data: publications, error } = await supabase
    .from('publications')
    .select(`
      id,
      platform,
      account_id,
      external_post_id,
      platform_accounts:account_id (
        id, access_token_encrypted, refresh_token_encrypted, expires_at, open_id, status
      )
    `)
    .eq('status', 'published')
    .in('platform', ['wechat_mp', 'weibo'])
    .not('external_post_id', 'is', null)
    .limit(100);

  if (error) {
    console.error('[metrics-fetch] query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; platform: string; status: string; error?: string }> = [];

  for (const pub of publications || []) {
    try {
      const acc = (pub as any).platform_accounts;
      if (!acc || acc.status !== 'active') {
        results.push({ id: pub.id, platform: pub.platform, status: 'skipped_no_account' });
        continue;
      }

      const accessToken = decryptTokenUnsafe(acc.access_token_encrypted);
      const platformId = pub.platform as PlatformId;
      const adapter = getAdapter(platformId);

      const metrics = await adapter.fetchMetrics(accessToken, pub.external_post_id, acc.open_id);

      const { error: insertError } = await supabase
        .from('publication_metrics')
        .insert({
          publication_id: pub.id,
          captured_at: metrics.capturedAt.toISOString(),
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          collects: metrics.collects || 0,
          followers_delta: metrics.followersDelta || 0,
        });

      if (insertError) throw new Error(insertError.message);

      results.push({ id: pub.id, platform: pub.platform, status: 'ok' });
    } catch (e: any) {
      console.error(`[metrics-fetch] ${pub.id} 失败:`, e);
      results.push({ id: pub.id, platform: pub.platform, status: 'failed', error: e.message });
    }
  }

  return NextResponse.json({
    success: true,
    total: results.length,
    success_count: results.filter((r) => r.status === 'ok').length,
    failed_count: results.filter((r) => r.status === 'failed').length,
    results,
    timestamp: new Date().toISOString(),
  });
}
