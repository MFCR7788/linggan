// B 站平台适配器
// Bilibili 开放平台: https://openhome.bilibili.com/
// API 优先，Selenium 降级

import type { PlatformAdapter, PublishInput, PublishResult, OAuthTokens, PlatformMetrics } from './types';
import { getEnv } from '@/lib/runtime-config';

const BILIBILI_AUTH_URL = 'https://api.bilibili.com/x/account-oauth2/v1/authorize';
const BILIBILI_TOKEN_URL = 'https://api.bilibili.com/x/account-oauth2/v1/token';
const BILIBILI_API = 'https://member.bilibili.com';

function getConfig() {
  return {
    clientId: getEnv('BILIBILI_CLIENT_ID') || '',
    clientSecret: getEnv('BILIBILI_CLIENT_SECRET') || '',
  };
}

export const bilibiliAdapter: PlatformAdapter = {
  id: 'bilibili',

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const { clientId } = getConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: 'all',
    });
    return `${BILIBILI_AUTH_URL}?${params}`;
  },

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = getConfig();
    const res = await fetch(BILIBILI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) throw new Error(`B站 换 token 失败: ${res.status}`);

    const data = await res.json();
    if (data.code !== 0) throw new Error(`B站 token 错误: ${data.message}`);

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: new Date(Date.now() + (data.data.expires_in || 7200) * 1000),
      openId: String(data.data.mid || ''),
    };
  },

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const { clientId, clientSecret } = getConfig();
    const res = await fetch(BILIBILI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error(`B站 刷新 token 失败: ${res.status}`);
    const data = await res.json();
    if (data.code !== 0) throw new Error(`B站 刷新错误: ${data.message}`);

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: new Date(Date.now() + (data.data.expires_in || 7200) * 1000),
      openId: String(data.data.mid || ''),
    };
  },

  async getAccountInfo(accessToken: string): Promise<{ name: string; avatar?: string }> {
    const res = await fetch(`${BILIBILI_API}/x/web-interface/nav`, {
      headers: { Cookie: `SESSDATA=${accessToken}` },
    });
    const data = await res.json();
    return {
      name: data?.data?.uname || 'B站用户',
      avatar: data?.data?.face || undefined,
    };
  },

  async publish(accessToken: string, input: PublishInput): Promise<PublishResult> {
    // B 站视频上传需要分片上传，流程复杂
    // 简化实现：跳转到上传页
    if (!input.videoUrl) {
      return {
        success: false,
        externalPostId: '',
        externalUrl: '',
        error: 'B站发布需要 videoUrl',
      };
    }

    // 实际发布走 B 站投稿 API（需分片上传）
    // 这里返回 Selenium 降级信号
    return {
      success: false,
      externalPostId: '',
      externalUrl: '',
      error: 'B站 API 视频上传需分片，建议用 Selenium 降级',
    };
  },

  async fetchMetrics(_accessToken: string, _externalPostId: string): Promise<PlatformMetrics> {
    return {
      views: 0, likes: 0, comments: 0, shares: 0,
      capturedAt: new Date(),
    };
  },
};
