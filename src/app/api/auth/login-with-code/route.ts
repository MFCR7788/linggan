import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, code, username } = await request.json();

    if (!phone || !phone.match(/^1[3-9]\d{9}$/)) {
      return NextResponse.json({ success: false, error: '请输入正确的手机号' }, { status: 400 });
    }

    if (!code || !code.match(/^\d{6}$/)) {
      return NextResponse.json({ success: false, error: '请输入6位验证码' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 验证验证码
    const { data: verification, error: queryError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (queryError || !verification) {
      return NextResponse.json({
        success: false,
        error: '验证码无效或已过期'
      }, { status: 400 });
    }

    // 标记验证码为已使用
    await supabase
      .from('verification_codes')
      .update({ used: true })
      .eq('id', verification.id);

    // 查找或创建用户
    const { data: existingUserByPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    const userId = existingUserByPhone?.id || generateUUID();

    // 确保用户记录存在
    await ensureUserProfile(userId, phone, username || phone);

    // 设置开发模式 cookie
    const cookieStore = cookies();
    cookieStore.set('dev_user_id', userId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    const mockSession = {
      access_token: `mock_token_${Date.now()}`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `mock_refresh_${Date.now()}`,
      user: {
        id: userId,
        app_metadata: {},
        user_metadata: { username: username || phone, phone },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      }
    };

    return NextResponse.json({
      success: true,
      message: '登录成功',
      session: mockSession
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '登录失败，请重试' },
      { status: 500 }
    );
  }
}

async function ensureUserProfile(userId: string, phone: string, username: string) {
  const supabase = createAdminClient();

  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (existingUser) {
    await supabase
      .from('users')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('id', userId);
    return;
  }

  const { data: userByPhone } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (userByPhone) {
    await supabase
      .from('users')
      .update({ username, updated_at: new Date().toISOString() })
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
    updated_at: new Date().toISOString()
  });

  if (!insertError) {
    await createDefaultCategories(userId, supabase);
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
