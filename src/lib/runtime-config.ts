// 运行时配置读取
// Next.js 在 build 时会将 process.env 内联，导致后续 .env.local 变更不生效。
// 此模块在运行时从文件系统读取敏感配置，绕过内联限制。

import { readFileSync } from 'fs';
import { resolve } from 'path';

let _envCache: Record<string, string> | null = null;

function loadEnvFile(): Record<string, string> {
  if (_envCache) return _envCache;
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    _envCache = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      _envCache[key] = val;
    }
  } catch {
    _envCache = {};
  }
  return _envCache;
}

/** 读取 env var，优先 process.env（build 时已设置），其次 .env.local 运行时文件 */
function getEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const fileEnv = loadEnvFile();
  return fileEnv[key] || undefined;
}

let _cachedCronSecret: string | undefined;

export function getCronSecret(): string | undefined {
  if (_cachedCronSecret !== undefined) return _cachedCronSecret;
  _cachedCronSecret = getEnv('CRON_SECRET') || '';
  return _cachedCronSecret || undefined;
}

export function getDashScopeApiKey(): string | undefined {
  return getEnv('DASHSCOPE_API_KEY') || getEnv('QWEN_API_KEY');
}

export function getVolcTtsAppId(): string | undefined {
  return getEnv('VOLC_TTS_APP_ID');
}

export function getVolcTtsAccessToken(): string | undefined {
  return getEnv('VOLC_TTS_ACCESS_TOKEN');
}

export function getHappyHorseApiKey(): string | undefined {
  return getEnv('HAPPYHORSE_API_KEY');
}

export function getHeyGenApiKey(): string | undefined {
  return getEnv('HEYGEN_API_KEY');
}

export function getDoubaoEndpointId(): string | undefined {
  return getEnv('DOUBAO_ENDPOINT_ID');
}

export { getEnv };
