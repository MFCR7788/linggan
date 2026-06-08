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

    // 2. 创建或查找用户
    //    策略：先搜索已有用户 → 没找到才创建 → 创建失败再搜索 → 最后直接调 REST API 兜底
    let authUserId: string | null = null;
    let isNewUser = false;

    // ── 2a. 先搜索：遍历 listUsers 查找已有用户 ──
    authUserId = await findUserByPhone(supabase, authEmail, phone, e164);
    if (authUserId) {
      console.log(`[login] 找到已有用户: ${authUserId}`);
    }

    // ── 2b. 未找到 → 尝试创建新用户 ──
    if (!authUserId) {
      console.log('[login] 未找到已有用户，尝试创建...');
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

      if (!createError && created?.user) {
        authUserId = created.user.id;
        isNewUser = true;
        console.log(`[login] 新建 auth user: ${authUserId} (phone=${phone})`);
      } else {
        if (createError) {
          console.warn(`[login] createUser 失败 (code=${createError?.code}, msg=${createError?.message}), 二次搜索...`);
        }

        // ── 2c. createUser 失败 → 再搜一次（并发请求可能刚好创建了） ──
        authUserId = await findUserByPhone(supabase, authEmail, phone, e164);
        if (authUserId) {
          console.log(`[login] 二次搜索找到用户: ${authUserId}`);
        }
      }
    }

    // ── 2d. 最终兜底：直接调 GoTrue REST API 创建用户 ──
    if (!authUserId) {
      console.log('[login] SDK 路径均失败，尝试直接调 GoTrue REST API 创建...');
      authUserId = await createUserViaRest(supabase, authEmail, deterministicPassword, phone, username || phone);
      if (authUserId) {
        isNewUser = true;
        console.log(`[login] REST API 创建成功: ${authUserId}`);
      }
    }

    if (!authUserId) {
      console.error('[login] 所有路径均失败:', authEmail);
      return NextResponse.json({ success: false, error: '账号创建失败,请稍后重试' }, { status: 500 });
    }

    // 3. 已存在用户：确保 email_confirm + 密码正确，迁移老用户 email
    if (!isNewUser) {
      const { error: ensureErr } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      });
      if (ensureErr) {
        console.warn('[login] ensureUserAuth 失败:', ensureErr.message);
      }

      // 老用户(Phase C 前的)可能 email 不是 authEmail 格式，需要迁移
      // 用 getUserById 确认当前 email
      const { data: authUser } = await supabase.auth.admin.getUserById(authUserId);
      if (authUser?.user?.email !== authEmail) {
        const { error: migrateErr } = await supabase.auth.admin.updateUserById(authUserId, {
          email: authEmail,
          email_confirm: true,
          password: deterministicPassword,
        });
        if (migrateErr) {
          console.error('[login] 老用户迁移到 email 失败:', migrateErr);
        } else {
          console.log(`[login] 老用户已迁移: ${authUserId} → email=${authEmail}`);
        }
      }

      // 更新 username(若有)
      if (username) {
        await supabase.auth.admin.updateUserById(authUserId, {
          user_metadata: { phone, username, source: 'phone_code' },
        }).catch((e) => console.warn('[login] updateUserMetadata 失败:', e));
      }
    }

    // 4. 写 public.users(若不存在,触发 init_user_credits 给 30 credits)
    await ensureUserProfile(authUserId, phone, username || phone, supabase);

    // 5. 用 ssr 客户端 signInWithPassword(自动 set sb-access-token cookie)
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
      // 6. 兜底：密码重置 + 确认邮箱
      console.warn(`[login] signInWithPassword 失败(code=${signInResult.error.code}, msg=${signInResult.error.message}), 兜底重置...`);
      const { error: resetError } = await supabase.auth.admin.updateUserById(authUserId, {
        email_confirm: true,
        password: deterministicPassword,
      });
      if (resetError) {
        console.error('[login] 兜底重置失败:', JSON.stringify(resetError));
        return NextResponse.json({ success: false, error: '登录失败,请稍后重试' }, { status: 500 });
      }
      signInResult = await ssr.auth.signInWithPassword({ email: authEmail, password: deterministicPassword });
      if (signInResult.error) {
        console.error(`[login] 兜底重置后仍失败, code=${signInResult.error.code}, msg=${signInResult.error.message}, status=${signInResult.error.status}`);
        return NextResponse.json({ success: false, error: '登录失败,请稍后重试' }, { status: 500 });
      }
    }

    // 7. 清除 dev cookie(已废弃)
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

/** 多页扫描 listUsers 查找用户，失败自动重试下一页 */
async function findUserByPhone(
  supabase: any,
  authEmail: string,
  phone: string,
  e164: string,
): Promise<string | null> {
  const maxPages = 10;
  const perPage = 50; // 小页避免 Vercel 超时
  for (let page = 1; page <= maxPages; page++) {
    try {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error(`[login] listUsers 第${page}页错误:`, listError?.message || listError);
        // 不 break，继续下一页（瞬时故障不影响后续页）
        continue;
      }
      if (!listData?.users || !Array.isArray(listData.users)) {
        console.warn(`[login] listUsers 第${page}页返回非预期格式:`, typeof listData);
        continue;
      }
      const found = listData.users.find(
        (u: any) => u.email === authEmail || u.user_metadata?.phone === phone || u.phone === e164
      );
      if (found) return found.id;
      // 最后一页不足 perPage 说明已到底
      if (listData.users.length < perPage) break;
    } catch (e: any) {
      console.error(`[login] listUsers 第${page}页异常:`, e?.message || e);
      // 继续下一页
    }
  }
  return null;
}

/** 直接调 Supabase GoTrue Admin REST API 创建用户（绕过 SDK，最终兜底） */
async function createUserViaRest(
  supabase: any,
  email: string,
  password: string,
  phone: string,
  username: string,
): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[login] REST API 缺少 SUPABASE_URL 或 SERVICE_ROLE_KEY');
      return null;
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
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

    const body = await res.text().catch(() => '');
    console.error(`[login] REST API createUser 失败: HTTP ${res.status} — ${body.substring(0, 200)}`);

    // 如果是 422 (already exists)，最后搜一次 listUsers
    if (res.status === 422) {
      return await findUserByPhone(supabase, email, phone, `+86${phone}`);
    }

    return null;
  } catch (e: any) {
    console.error('[login] REST API createUser 异常:', e?.message || e);
    return null;
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
