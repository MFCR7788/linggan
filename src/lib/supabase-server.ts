// Supabase 服务端工具
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';

// 简单的服务端客户端 - 用于 API routes（不需要 cookie 处理）
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
    }
  );
}

// 使用 service_role key 的管理员客户端（绕过 RLS）
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
    }
  );
}

// 服务端客户端 - 用于 API routes（带 cookie 处理）
// 直连 Postgres 的连接池(走 DATABASE_URL,可读 auth schema 等 PostgREST 禁的表)
// 用完即关,适合一次性 SQL(如清 refresh_tokens / 列 sessions)
export function createPgPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置,无法直连 Postgres');
  }
  const rejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false';
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized },
    max: 1,
  });
}

export function createSupabaseServerClient() {
  let cookieStore: ReturnType<typeof cookies>;
  try {
    cookieStore = cookies();
  } catch (e) {
    // cookies() 可能在 Server Component 或构建时不可用，降级为无 cookie 客户端
    return createClient();
  }

  return createServerClient(
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
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    }
  );
}

function deriveJwtSecret(): string {
  const salt = process.env.AUTH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'lingji-jwt-fallback';
  return createHash('sha256').update(`jwt:${salt}`).digest('hex');
}

// 获取当前用户
export async function getCurrentUser() {
  // 生产环境: 跳过 dev 短路, 只信任真实 Supabase 会话
  // 开发环境: dev header/cookie 用于无密码本地调试，需密钥校验或 localhost 限制
  const isDev = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_AUTH !== 'false';

  if (isDev) {
    const devAuthSecret = process.env.DEV_AUTH_SECRET;

    // 如果配置了 DEV_AUTH_SECRET，则验证密钥
    if (devAuthSecret) {
      try {
        const headersList = headers();
        const headerSecret = headersList.get('x-dev-auth-secret');
        if (headerSecret !== devAuthSecret) {
          console.warn('[getCurrentUser] DEV_AUTH_SECRET 不匹配，拒绝开发模式认证');
          // 继续走真实 Supabase 会话
        } else {
          const headerUserId = headersList.get('x-dev-user-id');
          if (headerUserId) {
            await ensureDevUserProfile(headerUserId);
            return createDevUser(headerUserId);
          }
          try {
            const cookieStore = cookies();
            const devUserId = cookieStore.get('dev_user_id');
            if (devUserId?.value) {
              await ensureDevUserProfile(devUserId.value);
              return createDevUser(devUserId.value);
            }
          } catch (_) {}
        }
      } catch (_) {
        // headers() 不可用时走真实会话
      }
    } else {
      // 未配置 DEV_AUTH_SECRET 时，仅允许 localhost IP（开发安全兜底）
      try {
        const headersList = headers();
        const forwardedFor = headersList.get('x-forwarded-for');
        const realIp = headersList.get('x-real-ip');
        const clientIp = (forwardedFor?.split(',')[0]?.trim() || realIp || '').replace(/^::ffff:/, '');
        const isLocalhost = !clientIp ||
          clientIp === '127.0.0.1' ||
          clientIp === '::1' ||
          clientIp === 'localhost';

        if (!isLocalhost) {
          console.warn(`[getCurrentUser] 非 localhost 请求(${clientIp})，开发模式认证被拒绝。请配置 DEV_AUTH_SECRET`);
        } else {
          const headerUserId = headersList.get('x-dev-user-id');
          if (headerUserId) {
            await ensureDevUserProfile(headerUserId);
            return createDevUser(headerUserId);
          }
          try {
            const cookieStore = cookies();
            const devUserId = cookieStore.get('dev_user_id');
            if (devUserId?.value) {
              await ensureDevUserProfile(devUserId.value);
              return createDevUser(devUserId.value);
            }
          } catch (_) {}
        }
      } catch (_) {
        // headers() 不可用时走真实会话
      }
    }
  }

  // 真实 Supabase 会话 (生产 + 开发通用, 优先信任)
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      return user;
    }
  } catch (e) {
    // 忽略 Supabase 会话错误
  }

  // 降级：GoTrue 故障时检查自定义 lingji_auth_token JWT
  try {
    const cookieStore = cookies();
    const lingjiToken = cookieStore.get('lingji_auth_token')?.value;
    if (lingjiToken) {
      const secret = deriveJwtSecret();
      const decoded = jwt.verify(lingjiToken, secret) as { sub: string; email: string; user_metadata: Record<string, unknown> };
      if (decoded?.sub) {
        return {
          id: decoded.sub,
          email: decoded.email || '',
          user_metadata: decoded.user_metadata || {},
        } as { id: string; email: string; user_metadata: Record<string, unknown> };
      }
    }
  } catch {
    // JWT 无效或过期，忽略
  }

  return null;
}

// 开发模式：创建一个模拟用户对象
function createDevUser(userId: string) {
  return {
    id: userId,
    email: 'dev@lingji.ai',
    user_metadata: {
      phone: userId.replace('user_', ''),
      username: '开发用户'
    }
  } as { id: string; email: string; user_metadata: Record<string, unknown> };
}

// 确保开发模式用户在数据库中存在（否则 FK 约束会导致写入失败）
async function ensureDevUserProfile(userId: string) {
  try {
    // 校验是否为合法 UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUUID) return;

    const supabase = createAdminClient();

    // 检查用户是否已在 public.users 中存在
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existing) return; // 已存在，无需创建

    // 生成 E.164 格式手机号（auth.users 要求）
    const phoneDigits = userId.replace(/[^0-9]/g, '').slice(0, 11);
    const e164Phone = phoneDigits ? `+86${phoneDigits.padStart(11, '0').slice(0, 11)}` : '+8613800000000';
    const displayPhone = phoneDigits.padStart(11, '0').slice(0, 11);

    // 通过 admin API 在 auth.users 中创建（public.users 有 FK 引用到 auth.users）
    const { error: createAuthError } = await supabase.auth.admin.createUser({
      id: userId,
      email: `dev_${displayPhone}@lingji.ai`,
      phone: e164Phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { username: '开发用户', phone: displayPhone },
    });

    if (createAuthError) {
      // 已注册过（邮箱冲突）：不再 return，仍尝试补建 public.users
      // 因为只缺 public.users 记录时 content_items 写入会 FK 失败
      console.warn('[ensureDevUserProfile] 创建 auth 用户失败（可能已存在）:', createAuthError.message);
    }

    // 插入 public.users
    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      phone: displayPhone,
      username: '开发用户',
      avatar_url: null,
      plan: 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.warn('[ensureDevUserProfile] 插入 public.users 失败:', insertError.message);
    }
  } catch (e) {
    console.warn('[ensureDevUserProfile] 创建用户失败:', e);
  }
}
