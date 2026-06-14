// 平台适配器接口定义
// 所有平台都实现这套接口,业务代码只对接接口,变更时只改具体实现

export type PlatformId = 'wechat_mp' | 'weibo' | 'douyin' | 'xiaohongshu' | 'wechat_video' | 'bilibili' | 'kuaishou';

export const PLATFORMS: Record<PlatformId, {
  name: string;
  emoji: string;
  color: string;
  autoPublish: boolean;       // 是否支持自动发布
  autoMetrics: boolean;       // 是否支持官方 API 抓数据
  seleniumFallback: boolean;  // 无 API 时是否支持 Selenium 降级
  helpText: string;
}> = {
  wechat_mp: {
    name: '微信公众号',
    emoji: '💬',
    color: '#07C160',
    autoPublish: true,
    autoMetrics: true,
    seleniumFallback: false,
    helpText: '需服务号 + 微信开放平台认证(企业资质)',
  },
  weibo: {
    name: '微博',
    emoji: '🔴',
    color: '#E6162D',
    autoPublish: true,
    autoMetrics: true,
    seleniumFallback: false,
    helpText: '个人开发者可申请',
  },
  douyin: {
    name: '抖音',
    emoji: '🎵',
    color: '#000000',
    autoPublish: false,
    autoMetrics: false,
    seleniumFallback: true,
    helpText: 'Selenium 自动发布（需本地 Chrome + 已登录）',
  },
  xiaohongshu: {
    name: '小红书',
    emoji: '📕',
    color: '#FF2442',
    autoPublish: false,
    autoMetrics: false,
    seleniumFallback: true,
    helpText: 'Selenium 自动发布（需本地 Chrome + 已登录）',
  },
  wechat_video: {
    name: '视频号',
    emoji: '📹',
    color: '#FA9D3B',
    autoPublish: false,
    autoMetrics: false,
    seleniumFallback: true,
    helpText: 'Selenium 自动发布（需本地 Chrome + 已登录）',
  },
  bilibili: {
    name: 'B 站',
    emoji: '📺',
    color: '#00A1D6',
    autoPublish: true,
    autoMetrics: false,
    seleniumFallback: true,
    helpText: 'B 站开放平台 API + Selenium 降级',
  },
  kuaishou: {
    name: '快手',
    emoji: '⚡',
    color: '#FF4906',
    autoPublish: false,
    autoMetrics: false,
    seleniumFallback: true,
    helpText: 'Selenium 自动发布（需本地 Chrome + 已登录）',
  },
};

export interface PublishInput {
  title: string;
  content: string;
  coverUrl?: string;
  /** V4.0: 视频文件 URL（本地路径或远程 URL） */
  videoUrl?: string;
  tags?: string[];
  /** 定时发布时间 (ISO 8601) */
  scheduleTime?: string;
}

export interface PublishResult {
  success: boolean;
  externalPostId: string;
  externalUrl: string;
  publishedAt?: Date;
  error?: string;
  strategy?: 'api' | 'selenium';
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
