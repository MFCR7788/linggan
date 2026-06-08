// 手机号 + 验证码 登录(走真实 Supabase Auth)
// 流程:
//   1. 校验入参,验证 verification_codes,标记 used
//   2. 查找/创建 auth.users(phone + deterministic password)
//   3. 用 createSupabaseServerClient 调 signInWithPassword → set sb-access-token cookie
//   4. 写 public.users(触发 init_user_credits 触发器,自动给 30 credits)
//   5. 清除 dev_user_id cookie(已废弃)
//   6. 返回真实 session 给前端
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createAdminClient, createPgPool } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// deterministic password = sha256(phone + AUTH_SALT).hex
function derivePassword(phone: string): string {
  const salt = process.env.AUTH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lingji-default-salt-please-set-AUTH_SALT';
  return createHash('sha256').update(`${phone}|${salt}`).digest('hex').slice(0, 48);
}

function toE164(phone: string): string {
  return phone.startsWith('+') ? phone : `+86${phone}`;
}

function toAuthEmail(phone: string): string {
  return `${phone}@phone.lingji.app`;
}

/** 直连 Postgres 查 auth.users — 最快最可靠的方式 */
async function findUserByEmail(email: string): Promise<string | null> {
  const pool = createPgPool();
  try {
    const result = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
      [email]
    );
    return result.rows[0]?.id || null;
  } catch (e: any) {
    console.error('[login] 直连 SQL 查用户失败:', e?.message || e);
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

/** SDK 创建用户，返回 { userId, error } */
async function sdkCreateUser(
  supabase: any, email: string, password: string, phone: string, username: string
): Promise<{ userId: string | null; error: any }> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, username, source: 'phone_code' },
  });
  if (!error && data?.user) {
    return { userId: data.user.id, error: null };
  }
  return { userId: null, error };
}

/** REST API 创建用户 — 绕过 SDK */
async function restCreateUser(
  email: string, password: string, phone: string, username: string
): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { phone, username, source: 'phone_code' },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data?.id || data?.user?.id || null;
    }
    console.error(`[login] REST API HTTP ${res.status} — ${await res.text().catch(() => '')}`);
    return null;
  } catch (e: any) {
    console.error('[login] REST API 异常:', e?.message || e);
    return null;
  }
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
      console.error('[login] 验证码查询失败:', queryError);
      return NextResponse.json({ success: false, error: '服务暂时不可用' }, { status: 500 });
    }
    if (!verification) {
      return NextResponse.json({ success: false, error: '验证码无效或已过期' }, { status: 400 });
    }

    // 标记验证码为已使用
    await supabase.from('verification_codes').update({ used: true }).eq('id', verification.id);

    const authEmail = toAuthEmail(phone);
    const deterministicPassword = derivePassword(phone);

    // ─── 2. 创建或查找用户 ───
    let authUserId: string | null = null;
    let isNewUser = false;
    let createError: any = null;

    // 2a. 先尝试 SDK createUser（新用户快路径，一次 API 调用搞定）
    const created = await sdkCreateUser(supabase, authEmail, deterministicPassword, phone, username || phone);
    if (created.userId) {
      authUserId = created.userId;
      isNewUser = true;
      console.log(`[login] 新建用户: ${authUserId}`);
    } else {
      createError = created.error;
      console.warn(`[login] SDK createUser 失败: code=${createError?.code} msg=${createError?.message}`);

      // 2b. 失败 → 直连 Postgres 查是否已有此邮箱用户
      authUserId = await findUserByEmail(authEmail);
      if (authUserId) {
        console.log(`[login] SQL 找到已有用户: ${authUserId}`);
      }
    }

    // 2c. SQL 也没找到 → REST API 兜底创建
    if (!authUserId) {
      authUserId = await restCreateUser(authEmail, deterministicPassword, phone, username || phone);
      if (authUserId) {
        isNewUser = true;
        console.log(`[login] REST API 创建成功: ${authUserId}`);
      }
    }

    // 2d. 全部失败 → 返回 Supabase 真实错误
    if (!authUserId) {
      const errMsg = createError
        ? `账号创建失败: ${createError.message} (${createError.code || createError.status || 'unknown'})`
        : '账号创建失败，请稍后重试';
      console.error('[login] 所有路径均失败:', authEmail, createError ? JSON.stringify(createError) : '');
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }

    // ─── 3. 已有用户：确保 auth 状态正确 ───
    if (!isNewUser) {
      const { error: ensureErr } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      });
      if (ensureErr) {
        console.warn('[login] ensureUserAuth 失败:', ensureErr.message);
      }

      // 老用户可能 email 格式不一致，迁移
      const { data: authUser } = await supabase.auth.admin.getUserById(authUserId);
      if (authUser?.user?.email !== authEmail) {
        const { error: migrateErr } = await supabase.auth.admin.updateUserById(authUserId, {
          email: authEmail,
          email_confirm: true,
          password: deterministicPassword,
        });
        if (migrateErr) {
          console.error('[login] 老用户 email 迁移失败:', migrateErr);
        } else {
          console.log(`[login] 老用户已迁移: ${authUserId} → ${authEmail}`);
        }
      }

      if (username) {
        await supabase.auth.admin.updateUserById(authUserId, {
          user_metadata: { phone, username, source: 'phone_code' },
        }).catch((e) => console.warn('[login] updateUserMetadata 失败:', e));
      }
    }

    // ─── 4. 写 public.users ───
    await ensureUserProfile(authUserId, phone, username || phone, supabase);

    // ─── 5. SSR signInWithPassword → set cookie ───
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

    let signInResult = await ssr.auth.signInWithPassword({ email: authEmail, password: deterministicPassword });
    if (signInResult.error) {
      console.warn(`[login] signIn 失败 (${signInResult.error.code}), 重置密码重试...`);
      const { error: resetError } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      });
      if (resetError) {
        console.error('[login] 密码重置失败:', JSON.stringify(resetError));
        return NextResponse.json({ success: false, error: '登录失败，请稍后重试' }, { status: 500 });
      }
      signInResult = await ssr.auth.signInWithPassword({ email: authEmail, password: deterministicPassword });
      if (signInResult.error) {
        console.error(`[login] 重置密码后仍失败: ${signInResult.error.code} ${signInResult.error.message}`);
        return NextResponse.json({ success: false, error: '登录失败，请稍后重试' }, { status: 500 });
      }
    }

    // ─── 6. 清除 dev cookie ───
    cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });

    return NextResponse.json({
      success: true,
      message: '登录成功',
      session: signInResult.data.session,
      user: {
        id: signInResult.data.user?.id,
        phone,
        username: username || phone,
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
    .select('*')
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

  const { error: insertError } = await supabase.from('users').insert({
    id: userId, phone, username,
    avatar_url: null, plan: 'free',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (!insertError) {
    const defaultCategories = [
      { name: '灵感', icon: '💡', color: '#3B82F6', sort_order: 0, is_default: true },
      { name: '选题', icon: '📝', color: '#8B5CF6', sort_order: 1, is_default: true },
      { name: '文案', icon: '✍️', color: '#F43F5E', sort_order: 2, is_default: true },
      { name: '视频素材', icon: '🎬', color: '#10B981', sort_order: 3, is_default: true },
    ];
    for (const cat of defaultCategories) {
      await supabase.from('categories').insert({ user_id: userId, ...cat });
    }
  } else {
    console.warn('[login] 插入 public.users 失败:', insertError);
  }
}
