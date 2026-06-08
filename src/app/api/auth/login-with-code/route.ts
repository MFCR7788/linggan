// 手机号 + 验证码 登录(走真实 Supabase Auth)
// 流程:
//   1. 校验入参,验证 verification_codes,标记 used
//   2. 查找/创建 auth.users — 4 级降级：SDK → SQL查找 → REST API → SQL直插
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

/** 直连 Postgres 查 auth.users */
async function findUserByEmail(email: string): Promise<string | null> {
  const pool = createPgPool();
  try {
    const result = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    return result.rows[0]?.id || null;
  } catch (e: any) {
    console.error('[login] SQL 查用户失败:', e?.message || e);
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * 最终兜底：直连 Postgres INSERT 到 auth.users（完全绕过 GoTrue）
 * 用 PostgreSQL pgcrypto 的 crypt() 做 bcrypt 哈希（Supabase 默认启用 pgcrypto）
 * INSERT 后立即用 SSR 客户端 signInWithPassword 验证密码可验证
 */
async function sqlCreateUser(
  email: string, password: string, phone: string, username: string
): Promise<string | null> {
  const pool = createPgPool();
  try {
    // 先确认 pgcrypto 可用，不可用则尝试启用
    try { await pool.query('SELECT gen_salt(\'bf\')'); } catch {
      await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    }

    const meta = JSON.stringify({ phone, username, source: 'phone_code' });
    const appMeta = JSON.stringify({ provider: 'email', providers: ['email'] });

    const result = await pool.query(
      `INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token,
        email_change_token_new, is_super_admin
      ) VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        $1,
        crypt($2, gen_salt('bf', 10)),
        now(),
        $3::jsonb,
        $4::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        false
      )
      ON CONFLICT (email) DO UPDATE SET
        encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = now()
      RETURNING id`,
      [email, password, appMeta, meta]
    );

    const userId = result.rows[0]?.id || null;
    if (userId) {
      console.log(`[login] SQL 直插用户成功: ${userId}`);
    }
    return userId;
  } catch (e: any) {
    console.error('[login] SQL 直插用户失败:', e?.message || e);
    return null;
  } finally {
    await pool.end().catch(() => {});
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

    await supabase.from('verification_codes').update({ used: true }).eq('id', verification.id);

    const authEmail = toAuthEmail(phone);
    const deterministicPassword = derivePassword(phone);
    const displayName = username || phone;

    // ─── 2. 创建/查找用户：4 级降级 ───
    let authUserId: string | null = null;
    let isNewUser = false;
    const errors: string[] = [];

    // L1: SDK createUser
    {
      const { data, error } = await supabase.auth.admin.createUser({ email: authEmail, password: deterministicPassword });
      if (!error && data?.user) {
        authUserId = data.user.id;
        isNewUser = true;
        console.log(`[login] L1 SDK 创建成功: ${authUserId}`);
      } else if (error) {
        errors.push(`SDK: ${error.message} (${error.code})`);
        console.warn(`[login] L1 SDK 失败: ${error.code} ${error.message}`);
      }
    }

    // L2: SQL 查找已有用户
    if (!authUserId) {
      authUserId = await findUserByEmail(authEmail);
      if (authUserId) {
        console.log(`[login] L2 SQL 找到用户: ${authUserId}`);
      }
    }

    // L3: REST API 创建
    if (!authUserId) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && key) {
          const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ email: authEmail, password: deterministicPassword }),
          });
          if (res.ok) {
            const d = await res.json();
            authUserId = d?.id || d?.user?.id || null;
            if (authUserId) {
              isNewUser = true;
              console.log(`[login] L3 REST 创建成功: ${authUserId}`);
            }
          } else {
            const body = await res.text().catch(() => '');
            errors.push(`REST: HTTP ${res.status} ${body.substring(0, 100)}`);
            console.warn(`[login] L3 REST 失败: ${res.status}`);
          }
        }
      } catch (e: any) {
        errors.push(`REST: ${e?.message}`);
      }
    }

    // L4: SQL 直插 auth.users（完全绕过 GoTrue）
    if (!authUserId) {
      authUserId = await sqlCreateUser(authEmail, deterministicPassword, phone, displayName);
      if (authUserId) {
        isNewUser = true;
        console.log(`[login] L4 SQL 直插成功: ${authUserId}`);
      }
    }

    if (!authUserId) {
      console.error('[login] 4 级全部失败:', authEmail, errors);
      return NextResponse.json({
        success: false,
        error: `账号创建失败: ${errors.join(' | ')}`,
      }, { status: 500 });
    }

    // ─── 3. 已有用户补充属性，新用户补充 email_confirm + metadata ───
    if (isNewUser) {
      // 新用户：补全 email_confirm + metadata（L4 SQL 直插已在 INSERT 时设好，但 SDK/REST 路径可能漏）
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        user_metadata: { phone, username: displayName, source: 'phone_code' },
      });
      if (updateError) {
        console.warn('[login] 补全用户属性失败:', updateError.message);
      }
    } else {
      // 已有用户：确保密码正确 + email_confirm
      await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      }).catch((e) => console.warn('[login] ensureUserAuth 失败:', e));

      // 老用户 email 格式迁移
      const { data: authUser } = await supabase.auth.admin.getUserById(authUserId);
      if (authUser?.user?.email !== authEmail) {
        await supabase.auth.admin.updateUserById(authUserId, {
          email: authEmail, email_confirm: true, password: deterministicPassword,
        }).catch((e) => console.warn('[login] 老用户迁移失败:', e));
      }
    }

    // ─── 4. 写 public.users ───
    await ensureUserProfile(authUserId, phone, displayName, supabase);

    // ─── 5. SSR signInWithPassword ───
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

    let signInResult = await ssr.auth.signInWithPassword({
      email: authEmail,
      password: deterministicPassword,
    });

    if (signInResult.error) {
      console.warn(`[login] signIn 失败 (${signInResult.error.code}), 重置密码...`);
      await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      });
      signInResult = await ssr.auth.signInWithPassword({
        email: authEmail,
        password: deterministicPassword,
      });
      if (signInResult.error) {
        console.error(`[login] 重置后仍失败: ${signInResult.error.code} ${signInResult.error.message}`);
        return NextResponse.json({
          success: false,
          error: `登录失败: ${signInResult.error.message} (${signInResult.error.code})`,
        }, { status: 500 });
      }
    }

    cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });

    return NextResponse.json({
      success: true,
      message: '登录成功',
      session: signInResult.data.session,
      user: { id: signInResult.data.user?.id, phone, username: displayName },
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
    const cats = [
      { name: '灵感', icon: '💡', color: '#3B82F6', sort_order: 0, is_default: true },
      { name: '选题', icon: '📝', color: '#8B5CF6', sort_order: 1, is_default: true },
      { name: '文案', icon: '✍️', color: '#F43F5E', sort_order: 2, is_default: true },
      { name: '视频素材', icon: '🎬', color: '#10B981', sort_order: 3, is_default: true },
    ];
    for (const cat of cats) {
      await supabase.from('categories').insert({ user_id: userId, ...cat });
    }
  } else {
    console.warn('[login] 插入 public.users 失败:', insertError);
  }
}
