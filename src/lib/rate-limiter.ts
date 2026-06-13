// 内存频率限制器（适用于 Vercel serverless 单实例保护）
// 生产环境建议替换为 Upstash Redis 实现以支持跨实例共享
const windows = new Map<string, { count: number; resetAt: number }>();

// 每 5 分钟清理一次过期窗口
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, w] of windows) {
    if (now > w.resetAt) windows.delete(key);
  }
}

interface RateLimitConfig {
  windowMs: number;   // 时间窗口 (毫秒)
  maxRequests: number; // 窗口内最大请求数
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

// 对不同路由应用不同限制
const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/auth': { windowMs: 60_000, maxRequests: 10 },     // 登录：10次/分钟
  '/api/sms':  { windowMs: 60_000, maxRequests: 5 },       // 短信：5次/分钟
  '/api/ai':   { windowMs: 60_000, maxRequests: 30 },      // AI：30次/分钟
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function getClientIp(ipHeader: string | null): string {
  if (!ipHeader) return 'unknown';
  // x-forwarded-for 可能包含多个 IP，取第一个
  return ipHeader.split(',')[0].trim();
}

function getConfig(pathname: string): RateLimitConfig {
  for (const [prefix, config] of Object.entries(ROUTE_LIMITS)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return DEFAULT_CONFIG;
}

export function checkRateLimit(
  ipHeader: string | null,
  pathname: string,
): RateLimitResult {
  cleanup();

  const config = getConfig(pathname);
  const ip = getClientIp(ipHeader);
  const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}`; // 按路由前缀分组

  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    const resetAt = now + config.windowMs;
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  existing.count++;
  if (existing.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - existing.count, resetAt: existing.resetAt };
}
