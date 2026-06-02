// 平台适配器接口定义
// 所有平台都实现这套接口,业务代码只对接接口,变更时只改具体实现

export type PlatformId = 'wechat_mp' | 'weibo' | 'douyin' | 'xiaohongshu' | 'wechat_video' | 'bilibili';

export const PLATFORMS: Record<PlatformId, {
  name: string;
  emoji: string;
  color: string;
  autoPublish: boolean;       // 是否支持 OAuth 自动发布
  autoMetrics: boolean;       // 是否支持官方 API 抓数据
  helpText: string;
}> = {
  wechat_mp: {
    name: '微信公众号',
    emoji: '💬',
    color: '#07C160',
    autoPublish: true,
    autoMetrics: true,
    helpText: '需服务号 + 微信开放平台认证(企业资质)',
  },
  weibo: {
    name: '微博',
    emoji: '🔴',
    color: '#E6162D',
    autoPublish: true,
    autoMetrics: true,
    helpText: '个人开发者可申请',
  },
  douyin: {
    name: '抖音',
    emoji: '🎵',
    color: '#000000',
    autoPublish: false,
    autoMetrics: false,
    helpText: '无个人开放 API,使用"复制引导页"手动发布',
  },
  xiaohongshu: {
    name: '小红书',
    emoji: '📕',
    color: '#FF2442',
    autoPublish: false,
    autoMetrics: false,
    helpText: '无个人开放 API,使用"复制引导页"手动发布',
  },
  wechat_video: {
    name: '视频号',
    emoji: '📹',
    color: '#FA9D3B',
    autoPublish: false,
    autoMetrics: false,
    helpText: '无个人开放 API,使用"复制引导页"手动发布',
  },
  bilibili: {
    name: 'B 站',
    emoji: '📺',
    color: '#00A1D6',
    autoPublish: false,
    autoMetrics: false,
    helpText: '使用"复制引导页"手动发布 + 手动录入数据',
  },
};

export interface PublishInput {
  title: string;
  content: string;
  coverUrl?: string;
  tags?: string[];
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string;
  publishedAt: Date;
}

export interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  collects?: number;
  followersDelta?: number;
  capturedAt: Date;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string;
  openId?: string;         // 微信开放平台 unionid
  accountName?: string;    // 账号名(用于显示)
  accountAvatar?: string;
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  /** 构造 OAuth 授权 URL(前端跳转用) */
  buildAuthorizeUrl(state: string, redirectUri: string): string;
  /** OAuth 回调:用 code 换 token */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** 刷新 access_token */
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  /** 拉取当前账号信息 */
  getAccountInfo(accessToken: string, openId?: string): Promise<{ name: string; avatar?: string }>;
  /** 发布内容 */
  publish(accessToken: string, input: PublishInput, openId?: string): Promise<PublishResult>;
  /** 抓取文章/动态的指标数据 */
  fetchMetrics(accessToken: string, externalPostId: string, openId?: string): Promise<PlatformMetrics>;
}
