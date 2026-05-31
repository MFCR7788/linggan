// Supabase 服务端工具
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

// 创建代理 fetch — 每个 Supabase 客户端注入独立 dispatcher，不污染全局
function createProxyFetch(): typeof globalThis.fetch {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (!proxyUrl) return globalThis.fetch;

  try {
    const { ProxyAgent, fetch: undiciFetch } = require('undici');
    const agent = new ProxyAgent(proxyUrl);
    console.log('[proxy] Supabase 客户端代理已启用:', proxyUrl);
    return ((url: any, init?: any) => {
      return undiciFetch(url, { ...init, dispatcher: agent });
    }) as typeof globalThis.fetch;
  } catch (e) {
    console.warn('[proxy] 创建代理 fetch 失败:', e);
    return globalThis.fetch;
  }
}

const proxyFetch = createProxyFetch();

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
      global: { fetch: proxyFetch },
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
      global: { fetch: proxyFetch },
    }
  );
}

// 服务端客户端 - 用于 API routes（带 cookie 处理）
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
      global: { fetch: proxyFetch },
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
    }
  );
}

// 获取当前用户
export async function getCurrentUser() {
  // 开发模式：先尝试从请求头中获取用户 ID（最可靠）
  try {
    const headersList = headers();
    const headerUserId = headersList.get('x-dev-user-id');
    if (headerUserId) {
      await ensureDevUserProfile(headerUserId);
      return createDevUser(headerUserId);
    }
  } catch (e) {
    // headers() 可能在某些上下文不可用
  }

  // 开发模式：再尝试从 cookies 中获取用户 ID
  try {
    const cookieStore = cookies();
    const devUserId = cookieStore.get('dev_user_id');
    if (devUserId?.value) {
      await ensureDevUserProfile(devUserId.value);
      return createDevUser(devUserId.value);
    }
  } catch (e) {
    // cookies() 可能在某些上下文不可用
  }

  // 最后尝试真实的 Supabase 会话（需要 middleware 刷新 session）
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      return user;
    }
  } catch (e) {
    // 忽略 Supabase 会话错误
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
  } as any;
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
      console.warn('[ensureDevUserProfile] 创建 auth 用户失败:', createAuthError.message);
      return;
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
