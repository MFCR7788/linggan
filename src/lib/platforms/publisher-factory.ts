// 发布器工厂 — API 优先，Selenium 降级
// 有公开 API 的平台优先使用 API，无 API 或无 token 时降级为 Selenium

import type { PlatformAdapter, PublishInput, PublishResult, PlatformId } from './types';
import { findAdapter } from './registry';
import { seleniumPublish } from './selenium-publisher';

/** 发布器配置 */
export interface PublisherConfig {
  /** Selenium Chrome Debugger 地址 */
  debuggerAddress?: string;
  /** Chromedriver 路径 */
  driverLocation?: string;
}

/**
 * 发布到指定平台
 * 优先尝试 API（如果有 PlatformAdapter），失败降级为 Selenium
 */
export async function publishToPlatform(
  platform: PlatformId,
  input: PublishInput,
  config: PublisherConfig = {}
): Promise<PublishResult> {
  // 1. 尝试 API 发布
  const adapter = findAdapter(platform);
  if (adapter) {
    try {
      const result = await apiPublish(adapter, input);
      if (result.success) return { ...result, strategy: 'api' as const };
      console.warn(`[publisher] ${platform} API 发布失败: ${result.error}，尝试 Selenium 降级`);
    } catch (e) {
      console.warn(`[publisher] ${platform} API 异常: ${e}，尝试 Selenium 降级`);
    }
  }

  // 2. Selenium 降级
  const seleniumUrls: Record<string, string> = {
    douyin: 'https://creator.douyin.com/creator-micro/content/upload',
    kuaishou: 'https://cp.kuaishou.com/article/publish/video',
    xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish?source=official',
    shipinhao: 'https://channels.weixin.qq.com/platform/post/create',
    bilibili: 'https://member.bilibili.com/platform/upload/video/frame',
  };

  const uploadUrl = seleniumUrls[platform];
  if (!uploadUrl) {
    return {
      success: false,
      externalPostId: '',
      externalUrl: '',
      error: `不支持的发布平台: ${platform}`,
    };
  }

  return seleniumPublish(input, {
    platform,
    driverType: 'chrome',
    debuggerAddress: config.debuggerAddress || 'localhost:9222',
    driverLocation: config.driverLocation,
    uploadUrl,
    timeout: 60000,
  });
}

/** API 发布（使用 adapter OAuth token） */
async function apiPublish(
  adapter: PlatformAdapter,
  input: PublishInput
): Promise<PublishResult> {
  // 需要从存储中获取 accessToken
  // 这里由调用方传入 token，通过闭包或参数传递
  // 简化实现：adapter 本身存储了 token
  const token = ''; // 由调用方从 platform_accounts 表中获取
  return adapter.publish(token, input);
}

/**
 * 一键发布到多个平台
 * 并行发布，返回各平台结果
 */
export async function publishToMultiple(
  platforms: PlatformId[],
  input: PublishInput,
  config?: PublisherConfig
): Promise<Record<string, PublishResult>> {
  const results = await Promise.all(
    platforms.map(async (platform) => {
      try {
        const result = await publishToPlatform(platform, input, config);
        return { platform, result };
      } catch (e) {
        return {
          platform,
          result: {
            success: false,
            externalPostId: '',
            externalUrl: '',
            error: e instanceof Error ? e.message : String(e),
          },
        };
      }
    })
  );

  return Object.fromEntries(results.map(r => [r.platform, r.result]));
}
