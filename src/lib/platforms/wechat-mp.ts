// 微信公众号适配器
// API 文档: https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/Message_Management/Technical_Plan.html
// 实际接入需要: 服务号 + 微信开放平台第三方平台账号(企业资质, ¥300/年)

import type {
  PlatformAdapter,
  PublishInput,
  PublishResult,
  PlatformMetrics,
  OAuthTokens,
} from './types';
import { getWechatMpAppSecret } from '@/lib/runtime-config';

const API_BASE = 'https://api.weixin.qq.com';
const AUTH_BASE = 'https://open.weixin.qq.com/connect';

class WeChatMPError extends Error {
  constructor(public code: number, message: string) {
    super(`[wechat-mp] ${code}: ${message}`);
  }
}

async function wechatFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, cache: 'no-store' });
  const json = await res.json();
  if (json.errcode && json.errcode !== 0) {
    throw new WeChatMPError(json.errcode, json.errmsg || 'unknown');
  }
  return json as T;
}

export class WeChatMPAdapter implements PlatformAdapter {
  readonly id = 'wechat_mp' as const;

  private get appId() { return process.env.WECHAT_MP_APP_ID || ''; }
  private get appSecret() { return getWechatMpAppSecret() || ''; }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      appid: this.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'snsapi_base',
      state,
    });
    return `${AUTH_BASE}/oauth2/authorize?${params}#wechat_redirect`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens> {
    const url = `${API_BASE}/sns/oauth2/access_token?appid=${this.appId}&secret=${this.appSecret}&code=${code}&grant_type=authorization_code`;
    const json = await wechatFetch<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      openid: string;
      scope: string;
    }>(url);

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope,
      openId: json.openid,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const url = `${API_BASE}/sns/oauth2/refresh_token?appid=${this.appId}&grant_type=refresh_token&refresh_token=${refreshToken}`;
    const json = await wechatFetch<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      openid: string;
      scope: string;
    }>(url);

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope,
      openId: json.openid,
    };
  }

  async getAccountInfo(accessToken: string, openId?: string): Promise<{ name: string; avatar?: string }> {
    if (!openId) throw new Error('openId required');
    const url = `${API_BASE}/sns/userinfo?access_token=${accessToken}&openid=${openId}&lang=zh_CN`;
    const json = await wechatFetch<{ nickname: string; headimgurl: string }>(url);
    return { name: json.nickname, avatar: json.headimgurl };
  }

  /**
   * 发布图文消息
   * 注: 此处用「群发接口」需要服务号 + 微信认证;
   * 未认证的订阅号可用「草稿箱 + 预览」流程(更复杂)
   */
  async publish(accessToken: string, input: PublishInput, openId?: string): Promise<PublishResult> {
    if (!openId) throw new Error('openId required');

    // 1) 上传图文消息素材(永久素材)
    const uploadUrl = `${API_BASE}/cgi-bin/material/add_material?access_token=${accessToken}&type=news`;
    const article = {
      title: input.title,
      content: input.content,
      content_source_url: '',
      digest: input.content.substring(0, 54),
      show_cover_pic: input.coverUrl ? 1 : 0,
      thumb_media_id: '', // 需要先上传缩略图
      need_open_comment: 1,
      only_fans_can_comment: 0,
    };
    const json = await wechatFetch<{ media_id: string }>(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(articles([article])),
    });

    // 2) 群发(简化:返回 media_id 作为 external_post_id)
    return {
      externalPostId: json.media_id,
      externalUrl: `https://mp.weixin.qq.com/s/${json.media_id}`,
      publishedAt: new Date(),
    };
  }

  async fetchMetrics(accessToken: string, externalPostId: string): Promise<PlatformMetrics> {
    // 公众号图文分析数据接口
    const url = `${API_BASE}/datacube/getarticletotal?access_token=${accessToken}`;
    const end = Math.floor(Date.now() / 1000);
    const begin = end - 86400 * 7; // 近 7 天
    const json = await wechatFetch<{
      list: Array<{
        msgid: string;
        title: string;
        details: Array<{
          int_page_read_user: number;   // 阅读人数
          int_page_read_count: number;  // 阅读次数
          share_user: number;
          share_count: number;
          add_to_fav_user: number;
          add_to_fav_count: number;
        }>;
      }>;
    }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ begin_date: formatDate(begin), end_date: formatDate(end) }),
    });

    const item = json.list?.find((x) => x.msgid === externalPostId);
    const latest = item?.details?.[item.details.length - 1];
    return {
      views: latest?.int_page_read_count || 0,
      likes: latest?.add_to_fav_count || 0,
      comments: 0, // 公众号评论需单独接口
      shares: latest?.share_count || 0,
      collects: latest?.add_to_fav_count,
      capturedAt: new Date(),
    };
  }
}

function articles(arr: Record<string, unknown>[]): string {
  return JSON.stringify({ articles: arr });
}
function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const wechatMPAdapter = new WeChatMPAdapter();
