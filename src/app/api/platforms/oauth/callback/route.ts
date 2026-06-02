// OAuth 回调
// GET /api/platforms/oauth/callback?code=xxx&state=xxx
// 1) 验证 state 拿到 userId + platform
// 2) 调平台 SDK 换 token
// 3) 存到 platform_accounts
// 4) 重定向到 UI

import { NextResponse } from 'next/server';
import { getAdapter } from '@/lib/platforms/registry';
import { verifyState } from '@/lib/platforms/oauth-state';
import { encryptTokenUnsafe } from '@/lib/platforms/encryption';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const failRedirect = (msg: string) =>
    NextResponse.redirect(`${appUrl}/publish?oauth_error=${encodeURIComponent(msg)}`);

  if (error) {
    return failRedirect(`用户取消授权或平台拒绝: ${error}`);
  }
  if (!code || !state) {
    return failRedirect('缺少 code 或 state 参数');
  }

  const statePayload = verifyState(state);
  if (!statePayload) {
    return failRedirect('state 验证失败(已过期或被篡改)');
  }

  try {
    const adapter = getAdapter(statePayload.platform as any);
    const redirectUri = `${appUrl}/api/platforms/oauth/callback`;
    const tokens = await adapter.exchangeCodeForTokens(code, redirectUri);

    // 存到 platform_accounts
    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from('platform_accounts')
      .upsert(
        {
          user_id: statePayload.userId,
          platform: statePayload.platform,
          account_name: tokens.accountName || `account_${Date.now()}`,
          account_avatar: tokens.accountAvatar,
          access_token_encrypted: encryptTokenUnsafe(tokens.accessToken),
          refresh_token_encrypted: tokens.refreshToken
            ? encryptTokenUnsafe(tokens.refreshToken)
            : null,
          expires_at: tokens.expiresAt.toISOString(),
          scope: tokens.scope,
          open_id: tokens.openId,
          status: 'active',
        },
        {
          onConflict: 'user_id,platform,open_id',
        }
      );

    if (dbError) throw new Error(dbError.message);

    return NextResponse.redirect(
      `${appUrl}/publish?oauth_success=${statePayload.platform}`
    );
  } catch (e: any) {
    console.error('[oauth/callback] 失败:', e);
    return failRedirect(e.message || '授权失败');
  }
}
