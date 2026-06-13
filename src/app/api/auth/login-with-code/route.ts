// 手机号 + 验证码 登录/注册
// 策略：先登录 → 失败则创建 → GoTrue 异常时 SQL 直插 auth.users 兜底
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { createAdminClient } from '@/lib/supabase-server';
import { grant } from '@/lib/credits';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function derivePassword(phone: string): string {
  const salt = process.env.AUTH_SALT;
  if (!salt) {
    throw new Error('FATAL: AUTH_SALT 未配置！生产环境必须设置 AUTH_SALT 环境变量。此值首次上线后不可变更。用 openssl rand -hex 64 生成。');
  }
  return createHash('sha256').update(`${phone}|${salt}`).digest('hex').slice(0, 48);
}

function toAuthEmail(phone: string): string {
  return `${phone}@phone.lingji.app`;
}

function deriveJwtSecret(): string {
  const salt = process.env.AUTH_SALT;
  if (!salt) {
    throw new Error('FATAL: AUTH_SALT 未配置，无法派生 JWT 密钥。');
  }
  return createHash('sha256').update(`jwt:${salt}`).digest('hex');
}

/** 通过 RPC 查找 auth.users 中的用户（绕过 GoTrue） */
async function rpcFindUser(supabase: SupabaseClient, email: string): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email });
    if (error || !data?.found) return null;
    return { id: data.id };
  } catch {
    return null;
  }
}

/** 通过 RPC 创建用户（绕过 GoTrue，走 PostgREST → auth.users） */
async function rpcCreateUser(supabase: SupabaseClient, email: string, password: string, phone: string, username: string): Promise<{ id: string } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('create_user_via_sql', {
      p_email: email,
      p_password: password,
      p_phone: phone,
      p_username: username,
    });
    if (error) {
      console.error('[login] RPC 创建用户失败:', error);
      return { error: error.message || String(error) };
    }
    // RPC 返回的是 UUID 字符串
    const id = typeof data === 'string' ? data : data?.id || data?.create_user_via_sql;
    if (!id) return { error: 'RPC 未返回用户 ID' };
    return { id };
  } catch (e: any) {
    console.error('[login] RPC 异常:', e?.message || e);
    return { error: e?.message || String(e) };
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
        // 用户已存在 → RPC 查找
        console.log('[login] 用户已存在，RPC 查找...');
        const existingUser = await rpcFindUser(supabase, authEmail);
        if (existingUser) {
          authUserId = existingUser.id;
          // 尝试重置密码（GoTrue 可能失败，失败也不影响 JWT 兜底）
        }
      } else {
        // GoTrue 异常 → 先通过 RPC 查找已有用户，没有再 RPC 创建
        console.warn('[login] GoTrue createUser 异常:', createError?.code, createError?.message);
        const existingUser = await rpcFindUser(supabase, authEmail);
        if (existingUser) {
          authUserId = existingUser.id;
          console.log('[login] RPC 找到已有用户:', authUserId);
        } else {
          // 不存在 → RPC 创建新用户
          const rpcResult = await rpcCreateUser(supabase, authEmail, deterministicPassword, phone, displayName);
          if ('id' in rpcResult) {
            authUserId = rpcResult.id;
            isNewUser = true;
            console.log('[login] RPC 创建用户成功:', authUserId);
          } else {
            return NextResponse.json({
              success: false,
              error: `注册失败: GoTrue 故障且 RPC 兜底也失败。请在 Supabase SQL Editor 确保已创建 create_user_via_sql 函数。RPC 错误: ${rpcResult.error}。GoTrue 错误: ${createError?.message || 'unknown'}`,
            }, { status: 500 });
          }
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

    if (!signInResult.error && signInResult.data?.session) {
      // GoTrue 正常：使用 Supabase session
      cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });
      return NextResponse.json({
        success: true,
        message: isNewUser ? '注册成功' : '登录成功',
        session: signInResult.data.session,
        user: { id: signInResult.data.user?.id, phone, username: displayName },
      });
    }

    // ── GoTrue 故障降级：自定义 JWT 认证 ──
    console.warn('[login] GoTrue signIn 失败，降级使用自定义 JWT。错误:', signInResult.error?.code, signInResult.error?.message);

    const jwtSecret = deriveJwtSecret();
    const token = jwt.sign(
      {
        sub: authUserId,
        email: authEmail,
        user_metadata: { phone, username: displayName },
        role: 'authenticated',
      },
      jwtSecret,
      { expiresIn: '365d' }
    );

    cookieStore.set('lingji_auth_token', token, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    cookieStore.set('lingji_auth_user_id', authUserId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    cookieStore.set('dev_user_id', '', { path: '/', maxAge: 0 });

    return NextResponse.json({
      success: true,
      message: isNewUser ? '注册成功' : '登录成功',
      user: { id: authUserId, phone, username: displayName },
    });
  } catch (error: any) {
    console.error('[login] 未捕获错误:', error);
    return NextResponse.json({ success: false, error: error.message || '登录失败' }, { status: 500 });
  }
}

async function ensureUserProfile(userId: string, phone: string, username: string, supabase: SupabaseClient) {
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
      try { await supabase.from('categories').insert({ user_id: userId, ...cat }); } catch { /* ignore duplicate */ }
    }
  }
}
