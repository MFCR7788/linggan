import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
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

  // 认证检查
  const devUserId = request.cookies.get('dev_user_id')?.value;

  if (!devUserId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
