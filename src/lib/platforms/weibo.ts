// 微博开放平台适配器
// API 文档: https://open.weibo.com/wiki/API
// 个人开发者可申请,门槛较低

import type {
  PlatformAdapter,
  PublishInput,
  PublishResult,
  PlatformMetrics,
  OAuthTokens,
} from './types';
import { getWeiboAppSecret } from '@/lib/runtime-config';

const API_BASE = 'https://api.weibo.com/2';
const AUTH_BASE = 'https://api.weibo.com/oauth2';

class WeiboError extends Error {
  constructor(public code: number, message: string) {
    super(`[weibo] ${code}: ${message}`);
  }
}

async function weiboFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, cache: 'no-store' });
  const json = await res.json();
  if (json.error_code && json.error_code !== 0) {
    throw new WeiboError(json.error_code, json.error || json.error_description || 'unknown');
  }
  return json as T;
}

export class WeiboAdapter implements PlatformAdapter {
  readonly id = 'weibo' as const;

  private get appKey() { return process.env.WEIBO_APP_KEY || ''; }
  private get appSecret() { return getWeiboAppSecret() || ''; }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.appKey,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: 'direct_messages_read,direct_messages_write,statuses_to_me_read,follow_app_official_microblog',
    });
    return `${AUTH_BASE}/authorize?${params}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.appKey,
      client_secret: this.appSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const json = await weiboFetch<{
      access_token: string;
      expires_in: number;
      uid: string;
      scope: string;
    }>(`${AUTH_BASE}/access_token?${params}`);

    const account = await this.getAccountInfo(json.access_token, json.uid);

    return {
      accessToken: json.access_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope,
      openId: json.uid,
      accountName: account.name,
      accountAvatar: account.avatar,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    // 微博 OAuth 2.0 不支持 refresh_token(授权一次,长期有效)
    throw new Error('微博不支持刷新 access_token, 需用户重新授权');
  }

  async getAccountInfo(accessToken: string, uid?: string): Promise<{ name: string; avatar?: string }> {
    const url = `${API_BASE}/users/show.json?access_token=${accessToken}&uid=${uid}`;
    const json = await weiboFetch<{ screen_name: string; profile_image_url: string; avatar_large: string }>(url);
    return { name: json.screen_name, avatar: json.avatar_large || json.profile_image_url };
  }

  /**
   * 发布微博(纯文本或带图)
   * 注: 微博 API 限制单条 2000 字以内
   */
  async publish(accessToken: string, input: PublishInput, uid?: string): Promise<PublishResult> {
    if (!uid) throw new Error('uid required');

    const status = buildStatusText(input);
    const url = `${API_BASE}/statuses/update.json`;
    const params = new URLSearchParams({ access_token: accessToken, status });
    const json = await weiboFetch<{
      id: string;
      user: { id: string };
      created_at: string;
    }>(`${url}?${params}`, { method: 'POST' });

    return {
      success: true,
      externalPostId: json.id,
      externalUrl: `https://weibo.com/${json.user.id}/${json.id}`,
      publishedAt: new Date(json.created_at),
    };
  }

  async fetchMetrics(accessToken: string, externalPostId: string): Promise<PlatformMetrics> {
    // 单条微博数据(包含转发/评论/赞)
    const url = `${API_BASE}/statuses/show.json?access_token=${accessToken}&id=${externalPostId}`;
    const json = await weiboFetch<{
      reposts_count: number;
      comments_count: number;
      attitudes_count: number;
      reads_count?: number;
    }>(url);

    return {
      views: json.reads_count || 0,
      likes: json.attitudes_count,
      comments: json.comments_count,
      shares: json.reposts_count,
      capturedAt: new Date(),
    };
  }
}

function buildStatusText(input: PublishInput): string {
  let text = input.title;
  if (input.content && input.content !== input.title) {
    text += `\n\n${input.content}`;
  }
  if (input.tags?.length) {
    text += '\n' + input.tags.map((t) => `#${t}#`).join(' ');
  }
  // 微博限制 2000 字
  if (text.length > 2000) {
    text = text.substring(0, 1997) + '...';
  }
  return text;
}

export const weiboAdapter = new WeiboAdapter();
