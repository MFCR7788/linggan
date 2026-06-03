// 用户安全设置 API
// POST  /api/user/security?action=change-password  → 改密码(先 verify 旧密码)
// POST  /api/user/security?action=sign-out-all    → 退出所有设备(删 refresh_tokens)
// GET   /api/user/security?action=sessions        → 列活跃 session(查 auth.sessions)

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient, createClient, createPgPool } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 改密码
 * 入参: { currentPassword, newPassword }
 * 流程:
 *   1. 拿 auth.users.phone(用 admin.getUserById)
 *   2. 用 anon client + signInWithPassword({ phone, currentPassword }) 验证旧密码
 *   3. admin.updateUserById 改新密码
 *   注:Supabase 改密码后所有现有 refresh_token 自动失效,等价于强制重新登录
 */
export const POST = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'change-password') {
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      return createApiError('请输入当前密码', 400);
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return createApiError('新密码至少 8 个字符', 400);
    }
    if (newPassword.length > 72) {
      return createApiError('新密码不能超过 72 字符(Supabase bcrypt 上限)', 400);
    }
    if (currentPassword === newPassword) {
      return createApiError('新密码不能与当前密码相同', 400);
    }

    const admin = createAdminClient();

    // 1. 拿 auth.users 里用户的 phone
    const { data: authUser, error: getUserError } = await admin.auth.admin.getUserById(user.id);
    if (getUserError || !authUser?.user) {
      return createApiError('用户不存在', 404);
    }
    const phone = authUser.user.phone;
    if (!phone) {
      return createApiError('该用户未绑定手机号,无法验证当前密码', 400);
    }

    // 2. verify 旧密码(用 anon client 走正常 signIn)
    const anon = createClient();
    const { error: signInError } = await anon.auth.signInWithPassword({
      phone,
      password: currentPassword,
    });
    if (signInError) {
      return createApiError('当前密码不正确', 401);
    }

    // 3. 改新密码
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      return createApiError(`改密码失败: ${updateError.message}`, 500);
    }

    return createApiResponse({ ok: true }, '密码已修改(其他设备已自动退出,请用新密码重新登录)');
  }

  if (action === 'sign-out-all') {
    // 直连 Postgres(PostgREST 默认不暴露 auth schema)
    const pool = createPgPool();
    try {
      // 1. 删 auth.refresh_tokens(等价于让所有 refresh token 失效)
      const rtRes = await pool.query(
        'DELETE FROM auth.refresh_tokens WHERE user_id = $1',
        [user.id]
      );
      const revokedTokens = rtRes.rowCount || 0;

      // 2. 删 auth.sessions(用于「列 sessions」同步)
      const sRes = await pool.query(
        'DELETE FROM auth.sessions WHERE user_id = $1',
        [user.id]
      );
      const revokedSessions = sRes.rowCount || 0;

      return createApiResponse(
        { ok: true, revokedTokens, revokedSessions },
        revokedTokens > 0
          ? `已强制退出该账号的所有设备(${revokedTokens} 个 refresh token)`
          : '没有可退出的设备'
      );
    } catch (e: any) {
      return createApiError(
        `退出失败: ${e.message}。建议直接「改密码」,Supabase 会让所有 refresh_token 失效。`,
        500
      );
    } finally {
      await pool.end();
    }
  }

  return createApiError('action 必须为 change-password 或 sign-out-all', 400);
});

/**
 * 列活跃 session(只列,不返 token)
 * 出参: { sessions: [{ id, createdAt, lastUsedAt, userAgent, ip }] }
 */
export const GET = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action !== 'sessions') {
    return createApiError('action 必须为 sessions', 400);
  }

  const pool = createPgPool();
  try {
    // 查 auth.sessions(PostgREST 默认不暴露 auth schema,直连)
    const { rows } = await pool.query(
      `SELECT id, created_at, updated_at, user_agent, ip, not_after
       FROM auth.sessions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.id]
    );

    const simplified = rows.map((s: any) => ({
      id: s.id,
      createdAt: s.created_at,
      lastUsedAt: s.updated_at || s.created_at,
      userAgent: s.user_agent || null,
      ip: s.ip || null,
      notAfter: s.not_after || null,
    }));

    return createApiResponse({ sessions: simplified });
  } catch (e: any) {
    return createApiError(`列 session 失败: ${e.message}`, 500);
  } finally {
    await pool.end();
  }
});
