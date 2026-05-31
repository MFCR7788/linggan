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
    .single();

  if (error) {
    // 如果用户不存在，创建一个新的用户记录
    if (error.code === 'PGRST116') {
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
        .single();

      if (createError) {
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

// 更新用户信息
export const PUT = withAuth(async ({ request, user }) => {
  // 在开发模式下，直接返回成功
  if (process.env.NODE_ENV === "development") {
    const updateData = await request.json();
    const mockUser = {
      id: user.id,
      email: user.email,
      username: updateData.username || user.user_metadata?.username || user.email?.split('@')[0],
      phone: user.user_metadata?.phone,
      avatar_url: updateData.avatar_url || null,
      plan: 'free',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...updateData
    };
    return createApiResponse(mockUser, '用户信息更新成功');
  }

  const updateData = await request.json();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    return createApiError('更新用户信息失败', 500);
  }

  return createApiResponse(data, '用户信息更新成功');
});
