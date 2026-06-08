// 手机号 + 验证码 登录/注册
// 策略：先尝试登录 → 成功则直接返回 → 失败则创建用户再登录
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function derivePassword(phone: string): string {
  const salt = process.env.AUTH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lingji-default-salt-please-set-AUTH_SALT';
  return createHash('sha256').update(`${phone}|${salt}`).digest('hex').slice(0, 48);
}

function toAuthEmail(phone: string): string {
  return `${phone}@phone.lingji.app`;
}

/** 用 admin client 试登录，成功返回 user，失败返回 null */
async function trySignIn(supabase: any, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data?.user) {
    return data.user;
  }
  if (error) {
    console.log('[login] 尝试登录:', error.code, error.message);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { phone, code, username } = await request.json() as {
      phone?: string; code?: string; username?: string;
    };

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ success: false, error: '请输入正确的手机号' }, { status: 400 });
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ success: false, error: '请输入6位验证码' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. 验证 verification_codes
    const { data: verification, error: queryError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (queryError) {
      return NextResponse.json({ success: false, error: '服务暂时不可用' }, { status: 500 });
    }
    if (!verification) {
      return NextResponse.json({ success: false, error: '验证码无效或已过期' }, { status: 400 });
    }

    await supabase.from('verification_codes').update({ used: true }).eq('id', verification.id);

    const authEmail = toAuthEmail(phone);
    const deterministicPassword = derivePassword(phone);
    const displayName = username || phone;

    // ─── 2. 先试登录：能登就是已有用户 ───
    let user = await trySignIn(supabase, authEmail, deterministicPassword);
    let isNewUser = false;

    if (!user) {
      // ─── 3. 不能登录 → 尝试创建新用户 ───
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: deterministicPassword,
      });

      if (!createError && created?.user) {
        // 新用户创建成功
        user = created.user;
        isNewUser = true;
        // 补充 email_confirm + metadata
        await supabase.auth.admin.updateUserById(user.id, {
          email_confirm: true,
          user_metadata: { phone, username: displayName, source: 'phone_code' },
        }).catch(() => {});
      } else if (createError?.code === 'email_exists' || String(createError?.message || '').includes('already')) {
        // 用户已存在但密码对不上 → 重置密码
        console.log('[login] 用户已存在，重置密码...');
        // 先查出用户 ID
        let existingId: string | null = null;
        for (let page = 1; page <= 5 && !existingId; page++) {
          const { data: listData } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
          if (!listData?.users?.length) break;
          const found = listData.users.find((u: any) =>
            u.email === authEmail || u.user_metadata?.phone === phone
          );
          if (found) existingId = found.id;
          if (listData.users.length < 100) break;
        }
        if (existingId) {
          await supabase.auth.admin.updateUserById(existingId, {
            email_confirm: true,
            password: deterministicPassword,
          });
          // 重试登录
          const retry = await trySignIn(supabase, authEmail, deterministicPassword);
          if (retry) user = retry;
        }
      } else {
        // 其他错误
        console.error('[login] createUser 失败:', createError?.code, createError?.message);
        return NextResponse.json({
          success: false,
          error: `注册失败: ${createError?.message || '未知错误'} (${createError?.code || 'unknown'})`,
        }, { status: 500 });
      }
    }

    if (!user) {
      return NextResponse.json({
        success: false,
        error: '登录失败，请稍后重试',
      }, { status: 500 });
    }

    // ─── 4. 确保 public.users 存在 ───
    await ensureUserProfile(user.id, phone, displayName, supabase);

    // ─── 5. SSR signIn → 设置 cookie ───
    const cookieStore = cookies();
    const ssr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch {}
          },
          remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch {}
          },
        },
        cookieOptions: {
          maxAge: 60 * 60 * 24 * 365,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        },
      }
    );

    const signInResult = await ssr.auth.signInWithPassword({
      email: authEmail,
      password: deterministicPassword,
    });

    if (signInResult.error) {
      console.error('[login] 最终 signIn 失败:', signInResult.error.code, signInResult.error.message);
      return NextResponse.json({
        success: false,
        error: '登录失败，请稍后重试',
      }, { status: 500 });
    }

    cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });

    return NextResponse.json({
      success: true,
      message: isNewUser ? '注册成功' : '登录成功',
      session: signInResult.data.session,
      user: {
        id: signInResult.data.user?.id,
        phone,
        username: displayName,
      },
    });
  } catch (error: any) {
    console.error('[login] 未捕获错误:', error);
    return NextResponse.json(
      { success: false, error: error.message || '登录失败，请重试' },
      { status: 500 }
    );
  }
}

async function ensureUserProfile(userId: string, phone: string, username: string, supabase: any) {
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', userId)
    .maybeSingle();

  if (existingUser) {
    if (username && existingUser.username !== username) {
      await supabase.from('users').update({ username, updated_at: new Date().toISOString() }).eq('id', userId);
    }
    return;
  }

  const { data: userByPhone } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle();

  if (userByPhone) {
    await supabase.from('users').update({ id: userId, username, updated_at: new Date().toISOString() }).eq('id', userByPhone.id);
    return;
  }

  const { error } = await supabase.from('users').insert({
    id: userId, phone, username,
    avatar_url: null, plan: 'free',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (!error) {
    const cats = [
      { name: '灵感', icon: '💡', color: '#3B82F6', sort_order: 0, is_default: true },
      { name: '选题', icon: '📝', color: '#8B5CF6', sort_order: 1, is_default: true },
      { name: '文案', icon: '✍️', color: '#F43F5E', sort_order: 2, is_default: true },
      { name: '视频素材', icon: '🎬', color: '#10B981', sort_order: 3, is_default: true },
    ];
    for (const cat of cats) {
      await supabase.from('categories').insert({ user_id: userId, ...cat }).catch(() => {});
    }
  }
}
