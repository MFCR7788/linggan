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
  const isDev = process.env.NODE_ENV !== 'production';
  const devUserId = request.cookies.get('dev_user_id')?.value;
  if (isDev && devUserId) {
    return NextResponse.next();
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
