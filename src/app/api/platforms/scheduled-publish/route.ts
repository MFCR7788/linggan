// 定时发布 worker
// 定时(每分钟)扫描 scheduled 状态的 publications,到点则调 publish 流程
// 鉴权: CRON_SECRET

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/platforms/registry';
import { decryptTokenUnsafe, encryptTokenUnsafe } from '@/lib/platforms/encryption';
import { hasAdapter } from '@/lib/platforms/registry';
import { type PlatformId } from '@/lib/platforms/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(request: Request): boolean {
  const secret = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['CRON_SECRET'];
  if (!secret) return false;
  const url = new URL(request.url);
  return request.headers.get('authorization') === `Bearer ${secret}`
    || url.searchParams.get('secret') === secret;
}

export async function GET(request: Request) {
  return runWorker(request);
}
export async function POST(request: Request) {
  return runWorker(request);
}

async function runWorker(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: pending, error } = await supabase
    .from('publications')
    .select(`
      *,
      platform_accounts:account_id (*)
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_publish_at', now)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const pub of pending || []) {
    try {
      if (!hasAdapter(pub.platform as PlatformId)) {
        // 手动平台,到点了发个通知(暂时只标记失败)
        await supabase
          .from('publications')
          .update({
            status: 'failed',
            error_message: '手动平台不支持自动定时发布, 请到时间手动发布',
          })
          .eq('id', pub.id);
        results.push({ id: pub.id, status: 'failed', error: 'manual platform' });
        continue;
      }

      const acc = (pub as any).platform_accounts;
      if (!acc || acc.status !== 'active') {
        await supabase
          .from('publications')
          .update({ status: 'failed', error_message: '授权账号已失效' })
          .eq('id', pub.id);
        results.push({ id: pub.id, status: 'failed', error: 'no_account' });
        continue;
      }

      // 切到 publishing
      await supabase
        .from('publications')
        .update({ status: 'publishing' })
        .eq('id', pub.id);

      let accessToken = decryptTokenUnsafe(acc.access_token_encrypted);
      if (acc.expires_at && new Date(acc.expires_at) < new Date(Date.now() + 60 * 1000)) {
        if (acc.refresh_token_encrypted) {
          try {
            const refreshToken = decryptTokenUnsafe(acc.refresh_token_encrypted);
            const newTokens = await getAdapter(pub.platform as PlatformId).refreshTokens(refreshToken);
            accessToken = newTokens.accessToken;
            await supabase
              .from('platform_accounts')
              .update({
                access_token_encrypted: encryptTokenUnsafe(newTokens.accessToken),
                refresh_token_encrypted: newTokens.refreshToken
                  ? encryptTokenUnsafe(newTokens.refreshToken)
                  : acc.refresh_token_encrypted,
                expires_at: newTokens.expiresAt.toISOString(),
              })
              .eq('id', acc.id);
          } catch (e) { /* 忽略,用老 token */ }
        }
      }

      const adapter = getAdapter(pub.platform as PlatformId);
      const result = await adapter.publish(accessToken, {
        title: pub.title,
        content: pub.content || '',
        coverUrl: pub.cover_url || undefined,
        tags: pub.tags || [],
      }, acc.open_id || undefined);

      await supabase
        .from('publications')
        .update({
          status: 'published',
          external_url: result.externalUrl,
          external_post_id: result.externalPostId,
          published_at: result.publishedAt.toISOString(),
        })
        .eq('id', pub.id);

      results.push({ id: pub.id, status: 'ok' });
    } catch (e: any) {
      console.error(`[scheduled-publish] ${pub.id} 失败:`, e);
      await supabase
        .from('publications')
        .update({ status: 'failed', error_message: e.message })
        .eq('id', pub.id);
      results.push({ id: pub.id, status: 'failed', error: e.message });
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
