import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
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
            cookieStore.set({ name, value: '', ...options });
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

  return NextResponse.json({ success: true });
}
