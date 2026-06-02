// 平台适配器注册表
// 业务代码通过 getAdapter(platformId) 获取对应实现

import type { PlatformAdapter, PlatformId } from './types';
import { wechatMPAdapter } from './wechat-mp';
import { weiboAdapter } from './weibo';

const REGISTRY: Partial<Record<PlatformId, PlatformAdapter>> = {
  wechat_mp: wechatMPAdapter,
  weibo: weiboAdapter,
};

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const adapter = REGISTRY[platform];
  if (!adapter) {
    throw new Error(`平台 ${platform} 暂未实现自动化(需用「复制引导页」手动发布)`);
  }
  return adapter;
}

export function getAutoPublishPlatforms(): PlatformId[] {
  return Object.keys(REGISTRY) as PlatformId[];
}

export function hasAdapter(platform: PlatformId): boolean {
  return platform in REGISTRY;
}
