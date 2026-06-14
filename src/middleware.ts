import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { checkRateLimit } from '@/lib/rate-limiter';

const protectedPaths = [
  '/home',
  '/ai',
  '/capture',
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
    // 降级：GoTrue 故障时检查自定义 auth cookie（记录日志便于监控）
    if (authError) {
      console.warn('[middleware] Supabase Auth 错误，启用降级:', authError.message?.substring(0, 100));
    }
    const lingjiUserId = request.cookies.get('lingji_auth_user_id')?.value;
    if (lingjiUserId) {
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
