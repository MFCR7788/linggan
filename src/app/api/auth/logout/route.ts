import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function clearSession(request: NextRequest) {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', maxAge: 0, ...options });
          } catch {}
        },
      },
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }
  );

  await supabase.auth.signOut();

  // 额外清除 dev 相关 cookie
  cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });
  cookieStore.set('dev_auth_secret', '', { path: '/', maxAge: 0 });

  // 清除客户端 localStorage session 对应的 cookie（如果有的话）
  cookieStore.set('sb-fibzvsstxxkdcflvtdzu-auth-token', '', { path: '/', maxAge: 0 });
}

// 导航式登出：浏览器直接跳转此 URL，Set-Cookie 头被正确处理
export async function GET(request: NextRequest) {
  await clearSession(request);
  const redirect = request.nextUrl.searchParams.get('redirect') || '/login';
  return NextResponse.redirect(new URL(redirect, request.url));
}

// fetch 式登出：兼容旧调用方式（fetch 不处理 Set-Cookie，建议前端用导航方式）
export async function POST(request: NextRequest) {
  await clearSession(request);
  return NextResponse.json({ success: true });
}
