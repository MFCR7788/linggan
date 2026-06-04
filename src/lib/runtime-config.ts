// 运行时配置读取
// Next.js 在 build 时会将 process.env 内联，导致后续 .env.local 变更不生效。
// 此模块在运行时从文件系统读取敏感配置，绕过内联限制。

import { readFileSync } from 'fs';
import { resolve } from 'path';

let _cachedCronSecret: string | undefined;

function parseEnvFile(content: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}=(.+)`, 'm');
  const match = content.match(regex);
  return match ? match[1].trim() : undefined;
}

export function getCronSecret(): string | undefined {
  if (_cachedCronSecret !== undefined) return _cachedCronSecret;

  // 优先 process.env（如果在 build 时已设置则有效）
  if (process.env.CRON_SECRET) {
    _cachedCronSecret = process.env.CRON_SECRET;
    return _cachedCronSecret;
  }

  // 运行时从 .env.local 读取
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    _cachedCronSecret = parseEnvFile(content, 'CRON_SECRET') || '';
  } catch {
    // .env.local 不存在
    _cachedCronSecret = '';
  }

  return _cachedCronSecret || undefined;
}
