// Selenium 通用发布引擎
// 用于无公开 API 的平台（视频号等）或 API 不可用时降级
// 复用用户已登录的浏览器实例（Chrome debuggerAddress / Firefox marionette）
// 注意：selenium-webdriver 是可选依赖，仅在 ECS 部署时使用

import type { PublishInput, PublishResult } from './types';

export interface SeleniumPublishOptions {
  platform: string;
  driverType: 'chrome' | 'firefox';
  debuggerAddress?: string;
  driverLocation?: string;
  uploadUrl: string;
  timeout?: number;
}

export interface SeleniumPublishResult extends PublishResult {
  strategy: 'selenium';
}

/**
 * Selenium 发布入口
 * 只在 ECS 有 Chrome 的环境中可用，Vercel 自动跳过
 */
export async function seleniumPublish(
  input: PublishInput,
  options: SeleniumPublishOptions
): Promise<SeleniumPublishResult> {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return {
      success: false,
      externalPostId: '',
      externalUrl: '',
      strategy: 'selenium',
      error: 'Selenium 发布在 Vercel 中不可用',
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Builder } = require('selenium-webdriver');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chrome = require('selenium-webdriver/chrome');

    const opts = new chrome.Options();
    if (options.debuggerAddress) {
      opts.options_ = opts.options_ || {};
      opts.options_['debuggerAddress'] = options.debuggerAddress;
    }

    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(opts)
      .build();

    await driver.manage().setTimeouts({ implicit: 10000 });

    try {
      await driver.get(options.uploadUrl);
      await driver.sleep(2000);

      const publisher = getPlatformPublisher(options.platform);
      if (!publisher) {
        throw new Error(`不支持的平台: ${options.platform}`);
      }

      const resultUrl = await publisher(driver, input);
      return { success: true, externalPostId: resultUrl, externalUrl: resultUrl, strategy: 'selenium' };
    } finally {
      await driver.quit();
    }
  } catch (e) {
    console.error(`[selenium] ${options.platform} 失败:`, e);
    return {
      success: false,
      externalPostId: '',
      externalUrl: '',
      strategy: 'selenium',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPlatformPublisher(platform: string): ((driver: any, input: PublishInput) => Promise<string>) | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { By, until } = require('selenium-webdriver');

  const publishers: Record<string, (driver: any, input: PublishInput) => Promise<string>> = {
    shipinhao: async (driver, input) => {
      const f = await driver.wait(until.elementLocated(By.css('input[type="file"]')), 15000);
      await f.sendKeys(input.videoUrl || '');
      await driver.sleep(3000);
      if (input.title) {
        const t = await driver.findElement(By.css('[placeholder*="标题"]'));
        await t.clear(); await t.sendKeys(input.title);
      }
      const btn = await driver.findElement(By.xpath("//button[contains(text(),'发表')]"));
      await btn.click(); await driver.sleep(5000);
      return '视频号已发布';
    },
    douyin: async (driver, input) => {
      const f = await driver.wait(until.elementLocated(By.css('input[type="file"]')), 15000);
      await f.sendKeys(input.videoUrl || '');
      await driver.sleep(5000);
      if (input.title) {
        const d = await driver.findElement(By.css('[placeholder*="描述"]'));
        await d.sendKeys(input.title);
      }
      const btn = await driver.wait(until.elementLocated(By.xpath("//button[contains(text(),'发布')]")), 10000);
      await btn.click(); await driver.sleep(5000);
      return '抖音已发布';
    },
    kuaishou: async (driver, input) => {
      const f = await driver.wait(until.elementLocated(By.css('input[type="file"]')), 15000);
      await f.sendKeys(input.videoUrl || '');
      await driver.sleep(5000);
      if (input.title) {
        const d = await driver.findElement(By.css('textarea'));
        await d.sendKeys(input.title);
      }
      const btn = await driver.findElement(By.xpath("//button[contains(text(),'发布')]"));
      await btn.click(); await driver.sleep(5000);
      return '快手已发布';
    },
    xiaohongshu: async (driver, input) => {
      const f = await driver.wait(until.elementLocated(By.css('input[type="file"]')), 15000);
      await f.sendKeys(input.videoUrl || '');
      await driver.sleep(5000);
      if (input.title) {
        const t = await driver.findElement(By.css('[placeholder*="标题"]'));
        await t.sendKeys(input.title);
      }
      const btn = await driver.findElement(By.xpath("//button[contains(text(),'发布')]"));
      await btn.click(); await driver.sleep(5000);
      return '小红书已发布';
    },
  };

  return publishers[platform] || null;
}
