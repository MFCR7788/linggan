// 发起 OAuth 授权
// POST /api/platforms/oauth/[platform]
// Body: { }
// Response: { authorizeUrl: string }

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { getAdapter, hasAdapter } from '@/lib/platforms/registry';
import { buildState } from '@/lib/platforms/oauth-state';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';

const VALID_PLATFORMS = Object.keys(PLATFORMS) as PlatformId[];

export const POST = withAuth(async ({ request, user, params }) => {
  const { platform } = params as { platform: string };
  if (!VALID_PLATFORMS.includes(platform as PlatformId)) {
    return createApiError('未知平台', 400);
  }
  if (!hasAdapter(platform as PlatformId)) {
    return createApiError(`${platform} 暂不支持自动授权, 请用「复制引导页」`, 400);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.nextUrl.host}`;
  const redirectUri = `${appUrl}/api/platforms/oauth/callback`;
  const state = buildState(user.id, platform);

  const adapter = getAdapter(platform as PlatformId);
  const authorizeUrl = adapter.buildAuthorizeUrl(state, redirectUri);

  return createApiResponse({ authorizeUrl, state, redirectUri });
});
