// Supabase 服务端工具
import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { getAuthSalt, getDevAuthSecret, getSupabaseAnonKey, getSupabaseUrl, getSupabaseServiceRoleKey, getEnv } from '@/lib/runtime-config';

// 简单的服务端客户端 - 用于 API routes（不需要 cookie 处理）
export function createClient() {
  return createSupabaseClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
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
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
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
// 单例缓存，避免每次调用创建新连接池导致连接泄漏
let _pgPool: Pool | null = null;
export function createPgPool(): Pool {
  if (_pgPool) return _pgPool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置,无法直连 Postgres');
  }
  const rejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false';
  _pgPool = new Pool({
    connectionString: getEnv('DATABASE_URL'),
    ssl: { rejectUnauthorized },
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  return _pgPool;
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
    getSupabaseUrl(),
    getSupabaseAnonKey(),
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

// 保存 AI 生成作品到 chat_messages（用于各 AI 工具页面的"历史生成"）
export async function saveWorkHistory(
  userId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createAdminClient();
  try {
    // 获取或创建"AI创作"会话 — 使用 upsert + onConflict 防止并发重复创建
    const { data: session, error: upsertErr } = await supabase
      .from('chat_sessions')
      .upsert({ user_id: userId, title: 'AI创作' }, { onConflict: 'user_id,title', ignoreDuplicates: false })
      .select('id')
      .maybeSingle();

    // upsert 可能因约束不存在而失败，降级为 select + insert
    let sessionId = session?.id;
    if (!sessionId || upsertErr) {
      const { data: existing } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('title', 'AI创作')
        .maybeSingle();
      sessionId = existing?.id;
      if (!sessionId) {
        const { data: created } = await supabase
          .from('chat_sessions')
          .insert({ user_id: userId, title: 'AI创作' })
          .select('id')
          .maybeSingle();
        sessionId = created?.id;
      }
    }

    if (!sessionId) return;

    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      user_id: userId,
      type: 'ai',
      content,
      content_type: 'text',
      metadata: { source: 'ai_creation', ...metadata },
    });

    // 只保留最近 20 条 AI 创作记录 — 使用 metadata->>source 精确匹配
    const { data: allRecords } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>source', 'ai_creation')
      .order('created_at', { ascending: false });

    if (allRecords && allRecords.length > 20) {
      const toDelete = allRecords.slice(20).map((r: { id: string }) => r.id);
      await supabase.from('chat_messages').delete().in('id', toDelete);
    }
  } catch (e) {
    console.warn('[saveWorkHistory] 写入失败:', e);
  }
}

function deriveJwtSecret(): string {
  const salt = getAuthSalt();
  if (!salt) {
    throw new Error('AUTH_SALT 未配置，无法派生 JWT 密钥。请在 .env.local 中设置 AUTH_SALT');
  }
  return createHash('sha256').update(`jwt:${salt}`).digest('hex');
}

// 获取当前用户
export async function getCurrentUser() {
  // 开发模式认证: 仅当 NODE_ENV=development 且 ENABLE_DEV_AUTH 未显式禁用时启用
  // 安全加固: 必须配置 DEV_AUTH_SECRET 才能使用 dev auth
  // x-forwarded-for / x-real-ip 可被客户端伪造，不再信任这些 header 做认证判断
  const isDev = process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH !== 'false';

  if (isDev) {
    const devAuthSecret = getDevAuthSecret();

    if (!devAuthSecret) {
      // 未配置 DEV_AUTH_SECRET：dev auth 完全禁用
      // 开发者需在 .env.local 中设置 DEV_AUTH_SECRET 才能使用 dev auth
      console.warn('[getCurrentUser] DEV_AUTH_SECRET 未配置，开发模式认证已禁用。请设置 DEV_AUTH_SECRET 后重启。');
    } else {
      try {
        // 方式 1：Header 认证 (x-dev-auth-secret + x-dev-user-id 或 dev_user_id cookie)
        const headersList = headers();
        const headerSecret = headersList.get('x-dev-auth-secret');
        if (headerSecret === devAuthSecret) {
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
        } else if (headerSecret) {
          console.warn('[getCurrentUser] DEV_AUTH_SECRET 不匹配，拒绝开发模式认证');
        }

        // 方式 2：Cookie 认证 (dev_auth_secret + dev_user_id cookie，与 middleware 一致)
        if (!headerSecret) {
          try {
            const cookieStore = cookies();
            const cookieSecret = cookieStore.get('dev_auth_secret')?.value;
            if (cookieSecret === devAuthSecret) {
              const devUserId = cookieStore.get('dev_user_id')?.value;
              if (devUserId) {
                await ensureDevUserProfile(devUserId);
                return createDevUser(devUserId);
              }
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
