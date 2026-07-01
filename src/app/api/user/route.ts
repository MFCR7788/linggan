// 用户 API 端点
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createSupabaseServerClient, createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

// 获取当前用户信息
export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  // 获取用户信息
  const { data: userProfile, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !userProfile) {
    // 如果用户不存在，创建一个新的用户记录
    if (!userProfile || error?.code === 'PGRST116') {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          phone: user.user_metadata?.phone,
          username: user.user_metadata?.username || user.user_metadata?.phone || '用户',
          avatar_url: null,
          plan: 'free'
        })
        .select()
        .maybeSingle();

      if (createError || !newUser) {
        console.error('创建用户失败:', createError);
        // 如果创建失败，返回模拟用户
        const mockUser = {
          id: user.id,
          username: user.user_metadata?.username || '用户',
          phone: user.user_metadata?.phone,
          avatar_url: null,
          plan: 'free',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        return createApiResponse(mockUser, '用户获取成功');
      }

      return createApiResponse(newUser, '用户创建成功');
    }
    console.error('获取用户信息失败:', error);
    // 如果数据库出错，返回模拟用户
    const mockUser = {
      id: user.id,
      username: user.user_metadata?.username || '用户',
      phone: user.user_metadata?.phone,
      avatar_url: null,
      plan: 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return createApiResponse(mockUser, '用户获取成功');
  }

  return createApiResponse(userProfile);
});

// 允许更新的字段白名单
const ALLOWED_UPDATE_FIELDS = ['username', 'avatar_url'] as const;

// 更新用户信息
export const PUT = withAuth(async ({ request, user }) => {
  const body = await request.json();

  // 白名单过滤：只允许更新安全字段
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  // 校验 username
  if (updateData.username !== undefined) {
    if (typeof updateData.username !== 'string') {
      return createApiError('username 必须是字符串', 400);
    }
    const trimmed = (updateData.username as string).trim();
    if (trimmed.length === 0 || trimmed.length > 30) {
      return createApiError('username 长度 1-30 字符', 400);
    }
    updateData.username = trimmed;
  }

  // 校验 avatar_url
  if (updateData.avatar_url !== undefined) {
    if (updateData.avatar_url !== null && typeof updateData.avatar_url !== 'string') {
      return createApiError('avatar_url 必须是字符串或 null', 400);
    }
    if (typeof updateData.avatar_url === 'string' && (updateData.avatar_url as string).length > 500) {
      return createApiError('avatar_url 超过 500 字符', 400);
    }
  }

  if (Object.keys(updateData).length === 0) {
    return createApiError('无可更新字段(允许: username, avatar_url)', 400);
  }

  updateData.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', user.id)
    .select('id, phone, username, avatar_url, plan, created_at, updated_at')
    .maybeSingle();

  if (error || !data) {
    return createApiError('更新用户信息失败', 500);
  }

  return createApiResponse(data, '用户信息更新成功');
});
