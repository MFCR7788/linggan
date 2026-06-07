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
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// deterministic password = sha256(phone + AUTH_SALT).hex
// 首次登录:admin.createUser(password=此值)
// 后续登录:signInWithPassword(password=此值)
// 老用户(密码不匹配):catch 错误 → admin.updateUserById 重置 → 再登录
function derivePassword(phone: string): string {
  const salt = process.env.AUTH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lingji-default-salt-please-set-AUTH_SALT';
  return createHash('sha256').update(`${phone}|${salt}`).digest('hex').slice(0, 48);
}

function toE164(phone: string): string {
  // 13800000000 → +8613800000000
  return phone.startsWith('+') ? phone : `+86${phone}`;
}

function toAuthEmail(phone: string): string {
  // 用 email 字段而不是 phone 字段(Supabase Phone provider 默认禁用)
  // 格式: 13800000000@phone.lingji.app
  return `${phone}@phone.lingji.app`;
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

    // 标记验证码为已使用(防止并发重用)
    await supabase
      .from('verification_codes')
      .update({ used: true })
      .eq('id', verification.id);

    const e164 = toE164(phone);
    const authEmail = toAuthEmail(phone);
    const deterministicPassword = derivePassword(phone);

    // 2. 查找 Supabase Auth 用户(按 email 查,Supabase Phone provider 默认禁用)
    let authUserId: string | null = null;
    // listUsers 默认按 email/phone/元数据分页;为简单起见,精确查 email
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listError) {
      console.error('[login] listUsers 失败:', listError);
      return NextResponse.json({ success: false, error: '服务暂时不可用' }, { status: 500 });
    }
    const existing = listData?.users?.find(
      (u: any) => u.email === authEmail || u.user_metadata?.phone === phone || u.phone === e164
    );
    authUserId = existing?.id ?? null;

    // 3. 不存在则创建(用 email 字段而非 phone,绕开 Supabase Phone provider)
    if (!authUserId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: deterministicPassword,
        email_confirm: true,
        user_metadata: {
          phone,
          username: username || phone,
          source: 'phone_code',
        },
      });
      if (createError || !created?.user) {
        console.error('[login] createUser 失败:', createError);
        return NextResponse.json({ success: false, error: '账号创建失败,请稍后重试' }, { status: 500 });
      }
      authUserId = created.user.id;
      console.log(`[login] 新建 auth user: ${authUserId} (phone=${phone})`);
    } else {
      // 4. 已存在
      // 4a. 老用户(Phase C 前的)只有 phone 字段,迁移到 email 登录
      const existingEmail: string | undefined = existing?.email;
      if (existingEmail !== authEmail) {
        const { error: migrateErr } = await supabase.auth.admin.updateUserById(authUserId, {
          email: authEmail,
          email_confirm: true,
          password: deterministicPassword,
        });
        if (migrateErr) {
          console.error('[login] 老用户迁移到 email 失败:', migrateErr);
          // 不阻断登录,先尝试 signIn(可能老密码碰巧对了)
        } else {
          console.log(`[login] 老用户已迁移: ${authUserId} → email=${authEmail}`);
        }
      }
      // 4b. 更新 username(若有)
      if (username) {
        await supabase.auth.admin.updateUserById(authUserId, {
          user_metadata: { phone, username, source: 'phone_code' },
        }).catch((e) => console.warn('[login] updateUserMetadata 失败:', e));
      }
    }

    // 5. 写 public.users(若不存在,触发 init_user_credits 给 30 credits)
    await ensureUserProfile(authUserId, phone, username || phone, supabase);

    // 6. 用 ssr 客户端 signInWithPassword(自动 set sb-access-token cookie)
    const cookieStore = cookies();
    const ssr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch { /* ignore */ }
          },
          remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch { /* ignore */ }
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
      // 7. 老用户密码不匹配 → 重置
      console.warn(`[login] signInWithPassword 失败(${signInResult.error.message}),重置密码后重试`);
      const { error: resetError } = await supabase.auth.admin.updateUserById(authUserId, {
        password: deterministicPassword,
      });
      if (resetError) {
        console.error('[login] 重置密码失败:', resetError);
        return NextResponse.json({ success: false, error: '登录失败,请稍后重试' }, { status: 500 });
      }
      signInResult = await ssr.auth.signInWithPassword({ email: authEmail, password: deterministicPassword });
      if (signInResult.error) {
        console.error('[login] 重置后仍登录失败:', signInResult.error);
        return NextResponse.json({ success: false, error: '登录失败,请稍后重试' }, { status: 500 });
      }
    }

    // 8. 清除 dev cookie(已废弃)
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
      { success: false, error: error.message || '登录失败,请重试' },
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
    // 仅在 username 变化时更新
    if (username && existingUser.username !== username) {
      await supabase
        .from('users')
        .update({ username, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }
    return;
  }

  const { data: userByPhone } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (userByPhone) {
    // 同一手机号有遗留的 public.users 记录(无对应 auth),更新 id 关联到新 auth user
    await supabase
      .from('users')
      .update({ id: userId, username, updated_at: new Date().toISOString() })
      .eq('id', userByPhone.id);
    return;
  }

  const { error: insertError } = await supabase.from('users').insert({
    id: userId,
    phone,
    username,
    avatar_url: null,
    plan: 'free',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (!insertError) {
    await createDefaultCategories(userId, supabase);
  } else {
    console.warn('[login] 插入 public.users 失败:', insertError);
  }
}

async function createDefaultCategories(userId: string, supabase: any) {
  const defaultCategories = [
    { name: '灵感', icon: '💡', color: '#3B82F6', sort_order: 0, is_default: true },
    { name: '选题', icon: '📝', color: '#8B5CF6', sort_order: 1, is_default: true },
    { name: '文案', icon: '✍️', color: '#F43F5E', sort_order: 2, is_default: true },
    { name: '视频素材', icon: '🎬', color: '#10B981', sort_order: 3, is_default: true },
  ];

  for (const category of defaultCategories) {
    await supabase.from('categories').insert({ user_id: userId, ...category });
  }
}
