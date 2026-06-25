import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { checkRateLimit } from '@/lib/rate-limiter';

// 短期 auth 缓存：同一 session 在短时间内避免重复 getUser() 网络调用
const authCache = new Map<string, { userId: string; expiresAt: number }>();
const AUTH_CACHE_TTL = 10_000; // 10 秒
const SESSION_COOKIE_PREFIX = 'sb-fibzvsstxxkdcflvtdzu-auth-token';

function getSessionCacheKey(request: NextRequest): string | null {
  const cookies = request.cookies.getAll();
  const parts = cookies
    .filter(c => c.name.startsWith(SESSION_COOKIE_PREFIX))
    .map(c => `${c.name}=${c.value}`)
    .sort()
    .join(';');
  return parts || null;
}

const protectedPaths = [
  '/home',
  '/ai',
  '/agent',
  '/hotspot',
  '/inspiration',
  '/schedule',
  '/notification',
  '/profile',
  '/publish',
  '/insights',
  '/workflow',
];

const publicPaths = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径直接放行
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // API 路由频率限制
  if (pathname.startsWith('/api/')) {
    const ipHeader = request.headers.get('x-forwarded-for');
    const { allowed, remaining, resetAt } = checkRateLimit(ipHeader, pathname);
    if (!allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', retryAfter: Math.ceil((resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      );
    }
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    res.headers.set('X-RateLimit-Reset', String(resetAt));
    return res;
  }

  // 检查是否需要保护
  const isProtected = protectedPaths.some(p => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  // 开发模式认证（仅 NODE_ENV=development 且配置了 DEV_AUTH_SECRET 时可用）
  // x-forwarded-for / x-real-ip 可被伪造，不再信任这些 header
  const isDev = process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH !== 'false';
  if (isDev) {
    const devAuthSecret = process.env.DEV_AUTH_SECRET;
    if (devAuthSecret) {
      const cookieSecret = request.cookies.get('dev_auth_secret')?.value;
      if (cookieSecret === devAuthSecret) {
        const devUserId = request.cookies.get('dev_user_id')?.value;
        if (devUserId) return NextResponse.next();
      }
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Supabase 环境变量缺失，重定向到登录');
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // 检查 auth 缓存（同一 session 10 秒内跳过网络调用）
  const cacheKey = getSessionCacheKey(request);
  if (cacheKey) {
    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      // 缓存命中，直接放行（不清除过期条目，靠后续写入时懒清理）
      return NextResponse.next();
    }
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    // auth 失败时缓存 miss（不清除旧缓存，自然过期）
    if (authError) {
      console.warn('[middleware] Supabase Auth 错误，启用降级:', authError.message?.substring(0, 100));
    }
    const lingjiUserId = request.cookies.get('lingji_auth_user_id')?.value;
    if (lingjiUserId) {
      if (cacheKey) {
        authCache.set(cacheKey, { userId: lingjiUserId, expiresAt: Date.now() + AUTH_CACHE_TTL });
      }
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // auth 成功，写入缓存
  if (cacheKey) {
    // 懒清理过期条目（Map 超过 200 条时全量清理）
    if (authCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of authCache) {
        if (v.expiresAt <= now) authCache.delete(k);
      }
    }
    authCache.set(cacheKey, { userId: user.id, expiresAt: Date.now() + AUTH_CACHE_TTL });
  }

  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
