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

  // 尝试服务端签退（可能因网络等原因失败）
  try {
    await supabase.auth.signOut();
  } catch (e: any) {
    console.warn('[logout] supabase.auth.signOut() 失败,继续清除 cookie:', e.message);
  }

  // 开发模式 cookie
  cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });
  cookieStore.set('dev_auth_secret', '', { path: '/', maxAge: 0 });

  // 清除所有可能的 Supabase auth cookie（含 PKCE 变体）
  const ref = 'fibzvsstxxkdcflvtdzu';
  for (const name of [
    `sb-${ref}-auth-token`,
    `sb-${ref}-auth-token.0`,
    `sb-${ref}-auth-token.1`,
    `sb-${ref}-auth-token-code-verifier`,
  ]) {
    cookieStore.set(name, '', { path: '/', maxAge: 0 });
    cookieStore.set(name, '', { path: '/', maxAge: 0, secure: true });
  }

  // 清除 GoTrue 降级 JWT cookie（login-with-code 在 GoTrue 故障时设置的）
  for (const name of ['lingji_auth_token', 'lingji_auth_user_id']) {
    cookieStore.set(name, '', { path: '/', maxAge: 0 });
    cookieStore.set(name, '', { path: '/', maxAge: 0, httpOnly: true, secure: true });
  }
}

// 导航式登出：浏览器直接跳转此 URL，Set-Cookie 头被正确处理
export async function GET(request: NextRequest) {
  await clearSession(request);
  const redirect = request.nextUrl.searchParams.get('redirect') || '/login';
  // 用 x-forwarded-host/x-forwarded-proto 构造正确的外部 URL，避免反代后重定向到 localhost
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return NextResponse.redirect(new URL(redirect, `${proto}://${host}`));
}

// fetch 式登出：兼容旧调用方式（fetch 不处理 Set-Cookie，建议前端用导航方式）
export async function POST(request: NextRequest) {
  await clearSession(request);
  return NextResponse.json({ success: true });
}
