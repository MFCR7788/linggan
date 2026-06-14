// 平台适配器注册表
// 业务代码通过 getAdapter(platformId) 获取对应实现
// V4.0: 扩展为 API + Selenium 双轨

import type { PlatformAdapter, PlatformId } from './types';
import { wechatMPAdapter } from './wechat-mp';
import { weiboAdapter } from './weibo';
import { bilibiliAdapter } from './bilibili';

const REGISTRY: Partial<Record<PlatformId, PlatformAdapter>> = {
  wechat_mp: wechatMPAdapter,
  weibo: weiboAdapter,
  bilibili: bilibiliAdapter,
};

/** 支持 Selenium 降级的平台（无官方 API 或 API 功能有限） */
const SELENIUM_FALLBACK_PLATFORMS: PlatformId[] = [
  'douyin',
  'xiaohongshu',
  'kuaishou',
  'wechat_video',
  'bilibili',
];

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const adapter = REGISTRY[platform];
  if (!adapter) {
    throw new Error(`平台 ${platform} 暂未实现自动化(需用「复制引导页」手动发布)`);
  }
  return adapter;
}

/** 查找 adapter（不抛错，返回 undefined） */
export function findAdapter(platform: PlatformId): PlatformAdapter | undefined {
  return REGISTRY[platform];
}

export function getAutoPublishPlatforms(): PlatformId[] {
  const apiPlatforms = Object.keys(REGISTRY) as PlatformId[];
  // 合并 API + Selenium 支持的平台
  const all = new Set([...apiPlatforms, ...SELENIUM_FALLBACK_PLATFORMS]);
  return Array.from(all);
}

export function hasAdapter(platform: PlatformId): boolean {
  return platform in REGISTRY || SELENIUM_FALLBACK_PLATFORMS.includes(platform);
}

export function isSeleniumOnly(platform: PlatformId): boolean {
  return SELENIUM_FALLBACK_PLATFORMS.includes(platform) && !(platform in REGISTRY);
}
