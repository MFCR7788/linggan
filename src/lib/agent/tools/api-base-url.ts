// Agent 工具共享 — 解析内部 API 的 base URL
// 解决工具在服务端环境调用本地 API 时可能因 NEXT_PUBLIC_SITE_URL 未设置而失败的问题

let _cachedBaseUrl: string | null = null;

/** 解析内部 API base URL（多源 fallback） */
export function getApiBaseUrl(): string {
  if (_cachedBaseUrl) return _cachedBaseUrl;

  // 1. NEXT_PUBLIC_SITE_URL（显式配置优先）
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    _cachedBaseUrl = process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
    return _cachedBaseUrl;
  }

  // 2. Vercel 自动注入
  if (process.env.VERCEL_URL) {
    _cachedBaseUrl = `https://${process.env.VERCEL_URL}`;
    return _cachedBaseUrl;
  }

  // 3. 生产域名硬编码 fallback
  if (process.env.NODE_ENV === 'production') {
    _cachedBaseUrl = 'https://ai.zjsifan.com';
    return _cachedBaseUrl;
  }

  // 4. 开发环境
  _cachedBaseUrl = 'http://localhost:3000';
  return _cachedBaseUrl;
}

/** 重置缓存（测试用） */
export function resetApiBaseUrlCache(): void {
  _cachedBaseUrl = null;
}
