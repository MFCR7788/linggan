// 用户资料 API
// GET   /api/user/profile              → 拉当前用户(public.users)
// PATCH /api/user/profile              → 改 username / avatar_url
// POST  /api/user/profile?action=change-phone  → 改手机号(本期 stub,需 SMS 完整流程)

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED_PROFILE_FIELDS = ['username', 'avatar_url'] as const;
type ProfileField = typeof ALLOWED_PROFILE_FIELDS[number];

export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, username, avatar_url, plan, created_at, updated_at')
    .eq('id', user.id)
    .single();

  if (error) return createApiError('用户不存在', 404);

  return createApiResponse({ user: data });
});

export const PATCH = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const update: Record<string, any> = {};

  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      return createApiError('username 必须是字符串', 400);
    }
    const trimmed = body.username.trim();
    if (trimmed.length === 0 || trimmed.length > 30) {
      return createApiError('username 长度 1-30 字符', 400);
    }
    update.username = trimmed;
  }

  if (body.avatar_url !== undefined) {
    if (body.avatar_url !== null && typeof body.avatar_url !== 'string') {
      return createApiError('avatar_url 必须是字符串或 null', 400);
    }
    if (typeof body.avatar_url === 'string' && body.avatar_url.length > 500) {
      return createApiError('avatar_url 超过 500 字符', 400);
    }
    update.avatar_url = body.avatar_url;
  }

  if (Object.keys(update).length === 0) {
    return createApiError('无可更新字段(允许: username, avatar_url)', 400);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', user.id)
    .select('id, phone, username, avatar_url, plan, created_at, updated_at')
    .single();

  if (error) return createApiError(error.message, 500);

  return createApiResponse({ user: data }, '已保存');
});

export const POST = withAuth(async ({ request, user }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action !== 'change-phone') {
    return createApiError('action 必须为 change-phone', 400);
  }

  // 改手机号需要 SMS 验证完整流程(发新码 → 校验 → 写 auth.users + public.users)
  // 本期先 stub
  return createApiError('换号功能需要完整 SMS 验证流程,本期暂未上线。请保留原手机号或联系客服。', 501);
});
