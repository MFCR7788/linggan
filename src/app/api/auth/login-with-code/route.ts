// 手机号 + 验证码 登录/注册
// 策略：先登录 → 失败则创建 → GoTrue 异常时 SQL 直插 auth.users 兜底
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createAdminClient, createPgPool } from '@/lib/supabase-server';
import { grant } from '@/lib/credits';

export const dynamic = 'force-dynamic';

function derivePassword(phone: string): string {
  const salt = process.env.AUTH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lingji-default-salt-please-set-AUTH_SALT';
  return createHash('sha256').update(`${phone}|${salt}`).digest('hex').slice(0, 48);
}

function toAuthEmail(phone: string): string {
  return `${phone}@phone.lingji.app`;
}

/** 直连 Postgres 创建用户（完全绕过 GoTrue） */
async function sqlCreateUser(email: string, password: string, phone: string, username: string): Promise<{ id: string } | { error: string }> {
  let pool: any = null;
  try {
    pool = createPgPool();
    // 确保 pgcrypto 可用
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    const appMeta = JSON.stringify({ provider: 'email', providers: ['email'] });
    const userMeta = JSON.stringify({ phone, username, source: 'phone_code' });
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
        'authenticated', 'authenticated',
        $1,
        crypt($2, gen_salt('bf', 10)),
        now(),
        $3::jsonb, $4::jsonb,
        now(), now(),
        '', '', '', false
      ) RETURNING id`,
      [email, password, appMeta, userMeta]
    );
    return { id: result.rows[0]?.id };
  } catch (e: any) {
    console.error('[login] SQL 直插失败:', e?.message || e);
    return { error: e?.message || String(e) };
  } finally {
    if (pool) await pool.end().catch(() => {});
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

    // 1. 验证码校验
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

    // ─── 2. 先尝试登录 ───
    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: authEmail, password: deterministicPassword,
    });
    let authUserId: string | null = signInData?.user?.id || null;
    let isNewUser = false;

    if (authUserId) {
      console.log('[login] 已有用户直接登录:', authUserId);
    } else {
      // ─── 3. 登录失败，尝试创建 ───
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: deterministicPassword,
        email_confirm: true,
      });

      if (!createError && created?.user) {
        // 新用户创建成功
        authUserId = created.user.id;
        isNewUser = true;
        // 补充 email_confirm + metadata
        await supabase.auth.admin.updateUserById(authUserId, {
          email_confirm: true,
          user_metadata: { phone, username: displayName, source: 'phone_code' },
        }).catch(() => {});
      } else if (createError?.code === 'email_exists' || String(createError?.message || '').toLowerCase().includes('already')) {
        // 用户已存在但密码不对 → listUsers 找到后重置
        console.log('[login] 用户已存在，search listUsers...');
        for (let page = 1; page <= 5; page++) {
          const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
          if (!list?.users?.length) break;
          const found = list.users.find((u: any) =>
            u.email === authEmail || u.user_metadata?.phone === phone
          );
          if (found) {
            authUserId = found.id;
            await supabase.auth.admin.updateUserById(authUserId, {
              email_confirm: true, password: deterministicPassword,
            });
            break;
          }
          if (list.users.length < 100) break;
        }
      } else {
        // GoTrue 异常（unexpected_failure）→ SQL 直插兜底
        console.warn('[login] GoTrue createUser 异常:', createError?.code, createError?.message);
        const sqlResult = await sqlCreateUser(authEmail, deterministicPassword, phone, displayName);
        if ('id' in sqlResult) {
          authUserId = sqlResult.id;
          isNewUser = true;
          console.log('[login] SQL 直插创建成功:', authUserId);
        } else {
          return NextResponse.json({
            success: false,
            error: `注册失败: GoTrue 创建失败且 SQL 直插不可用。SQL 错误: ${sqlResult.error}。请确保 Vercel 环境变量已配置 DATABASE_URL (Supabase Dashboard → Settings → Database → Connection string)。GoTrue 错误: ${createError?.message || 'unknown'} (${createError?.code || 'unknown'})`,
          }, { status: 500 });
        }
      }
    }

    if (!authUserId) {
      return NextResponse.json({
        success: false,
        error: '登录失败：未找到用户且无法创建',
      }, { status: 500 });
    }

    // ─── 4. 确保 public.users ───
    await ensureUserProfile(authUserId, phone, displayName, supabase);

    // 新用户注册赠送初始灵力
    if (isNewUser) {
      await grant(authUserId, 100, 'admin_adjust', 'signup_bonus', '新用户注册赠送 100 灵力').catch(err => {
        console.error('[login] 新用户赠送灵力失败:', err);
      });
    }

    // ─── 5. SSR session cookie ───
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
      email: authEmail, password: deterministicPassword,
    });

    if (signInResult.error) {
      // 最后一次兜底：重置密码后重试
      const { error: resetErr } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true, password: deterministicPassword,
      });
      if (resetErr) {
        console.error('[login] 最终重置失败:', resetErr);
        return NextResponse.json({ success: false, error: '登录失败: 无法重置密码' }, { status: 500 });
      }
      const retry = await ssr.auth.signInWithPassword({
        email: authEmail, password: deterministicPassword,
      });
      if (retry.error) {
        return NextResponse.json({ success: false, error: '登录失败: 密码重置后仍无法登录' }, { status: 500 });
      }
      cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });
      return NextResponse.json({
        success: true,
        message: isNewUser ? '注册成功' : '登录成功',
        session: retry.data.session,
        user: { id: retry.data.user?.id, phone, username: displayName },
      });
    }

    cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });

    return NextResponse.json({
      success: true,
      message: isNewUser ? '注册成功' : '登录成功',
      session: signInResult.data.session,
      user: { id: signInResult.data.user?.id, phone, username: displayName },
    });
  } catch (error: any) {
    console.error('[login] 未捕获错误:', error);
    return NextResponse.json({ success: false, error: error.message || '登录失败' }, { status: 500 });
  }
}

async function ensureUserProfile(userId: string, phone: string, username: string, supabase: any) {
  const { data: exist } = await supabase.from('users').select('id, username').eq('id', userId).maybeSingle();
  if (exist) {
    if (username && exist.username !== username) {
      await supabase.from('users').update({ username, updated_at: new Date().toISOString() }).eq('id', userId);
    }
    return;
  }

  const { data: byPhone } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle();
  if (byPhone) {
    await supabase.from('users').update({ id: userId, username, updated_at: new Date().toISOString() }).eq('id', byPhone.id);
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
