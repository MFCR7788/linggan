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

/** 读取 env var，优先 .env.local 运行时文件（绕过 Next.js build 时内联），其次 process.env */
function getEnv(key: string): string | undefined {
  const fileEnv = loadEnvFile();
  if (fileEnv[key]) return fileEnv[key];
  return process.env[key] || undefined;
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
  return getEnv('HAPPYHORSE_API_KEY') || getEnv('DASHSCOPE_API_KEY');
}

export function getHeyGenApiKey(): string | undefined {
  return getEnv('HEYGEN_API_KEY');
}

export function getDoubaoEndpointId(): string | undefined {
  return getEnv('DOUBAO_ENDPOINT_ID');
}

export function getOpenRouterApiKey(): string | undefined {
  return getEnv('OPENROUTER_API_KEY');
}

export function getAgnesApiKey(): string | undefined {
  return getEnv('AGNES_API_KEY');
}

export function getArkApiKey(): string | undefined {
  return getEnv('ARK_API_KEY');
}

export function getAuthSalt(): string | undefined {
  return getEnv('AUTH_SALT');
}

export function getAliyunSmsTemplateCode(): string {
  return getEnv('ALIYUN_SMS_TEMPLATE_CODE') || 'SMS_506745050';
}

export function getAliyunSmsSignName(): string {
  return getEnv('ALIYUN_SMS_SIGN_NAME') || '魔法超人';
}

export function getSupabaseUrl(): string {
  return getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL') || '';
}

export function getSupabaseAnonKey(): string {
  return getEnv('SUPABASE_ANON_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || '';
}

export function getSupabaseServiceRoleKey(): string {
  return getEnv('SUPABASE_SERVICE_ROLE_KEY') || '';
}

export function getDevAuthSecret(): string | undefined {
  return getEnv('DEV_AUTH_SECRET');
}

export function getPlatformEncryptionKey(): string | undefined {
  return getEnv('PLATFORM_ENCRYPTION_KEY');
}

export function getWechatPayApiV3Key(): string | undefined {
  return getEnv('WECHAT_PAY_API_V3_KEY');
}

export function getWechatPayPrivateKey(): string | undefined {
  return getEnv('WECHAT_PAY_PRIVATE_KEY');
}

export function getWechatMpAppSecret(): string | undefined {
  return getEnv('WECHAT_MP_APP_SECRET');
}

export function getWeiboAppSecret(): string | undefined {
  return getEnv('WEIBO_APP_SECRET');
}

export function getJinaApiKey(): string | undefined {
  return getEnv('JINA_API_KEY');
}

export function getExaApiKey(): string | undefined {
  return getEnv('EXA_API_KEY');
}

export function getAliyunSmsAccessKeyId(): string | undefined {
  return getEnv('ALIYUN_SMS_ACCESS_KEY_ID') || getEnv('ALIYUN_ACCESS_KEY_ID');
}

export function getAliyunSmsAccessKeySecret(): string | undefined {
  return getEnv('ALIYUN_SMS_ACCESS_KEY_SECRET') || getEnv('ALIYUN_ACCESS_KEY_SECRET');
}

export function getAliyunSmsRegionId(): string {
  return getEnv('ALIYUN_SMS_REGION_ID') || 'cn-hangzhou';
}

export function getDebugSecret(): string | undefined {
  return getEnv('DEBUG_SECRET');
}

// ─── 媒体素材搜索 ────────────────────────────────────────────

export function getPexelsApiKey(): string | undefined {
  return getEnv('PEXELS_API_KEY');
}

export function getPixabayApiKey(): string | undefined {
  return getEnv('PIXABAY_API_KEY');
}

export function getUnsplashAccessKey(): string | undefined {
  return getEnv('UNSPLASH_ACCESS_KEY');
}

// ─── DeepSeek（用于关键词翻译等轻量 LLM 调用） ────────────────

export function getDeepSeekApiKey(): string | undefined {
  return getEnv('DEEPSEEK_API_KEY');
}

export { getEnv };
