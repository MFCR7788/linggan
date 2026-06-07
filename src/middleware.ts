import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const protectedPaths = [
  '/home',
  '/ai',
  '/capture',
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

  // API 路由由 withAuth 自行处理认证
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 检查是否需要保护
  const isProtected = protectedPaths.some(p => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  // 开发模式认证（仅 localhost 或配置了 DEV_AUTH_SECRET 时可用）
  // 生产环境 (NODE_ENV=production) 下此代码块永不执行，
  // 双重保护：可通过 ENABLE_DEV_AUTH=false 在开发构建中强制禁用
  const isDev = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_AUTH !== 'false';
  if (isDev) {
    const devAuthSecret = process.env.DEV_AUTH_SECRET;
    if (devAuthSecret) {
      // 配置了 DEV_AUTH_SECRET 时验证 cookie 中的密钥
      const cookieSecret = request.cookies.get('dev_auth_secret')?.value;
      if (cookieSecret === devAuthSecret) {
        const devUserId = request.cookies.get('dev_user_id')?.value;
        if (devUserId) return NextResponse.next();
      }
    } else {
      // 未配置时仅允许 localhost
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || '';
      const isLocalhost = !clientIp ||
        clientIp === '127.0.0.1' ||
        clientIp === '::1' ||
        clientIp === 'localhost';
      if (isLocalhost) {
        const devUserId = request.cookies.get('dev_user_id')?.value;
        if (devUserId) return NextResponse.next();
      }
    }
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
