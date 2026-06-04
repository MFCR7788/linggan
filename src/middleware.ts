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

  // 用 Supabase Auth 验证 session(兼容 dev cookie 兜底,仅限开发)
  // TODO(prod): 部署生产前删除整个 dev auth 快捷路径（第 40-63 行），
  // 仅保留下方的 Supabase Auth 验证。dev cookie 绕过会导致任意用户模拟。
  const isDev = process.env.NODE_ENV !== 'production';
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
