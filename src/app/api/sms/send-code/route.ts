import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const DEV_CODE = '123456';
const CODE_EXPIRY_MINUTES = 30;

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date();

    // 1. 清理全局过期验证码（5分钟前）
    await supabase
      .from('verification_codes')
      .delete()
      .lt('created_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString());

    // 2. 清理当前手机号的所有验证码
    await supabase
      .from('verification_codes')
      .delete()
      .eq('phone', phone);

    // 3. 生成新验证码
    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        phone,
        code: DEV_CODE,
        used: false,
        expires_at: new Date(now.getTime() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error('验证码存储失败:', insertError);
      return NextResponse.json({
        error: '服务暂时不可用'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送（开发模式：请使用 123456）',
      code: process.env.NODE_ENV === 'development' ? DEV_CODE : undefined
    });
  } catch (error) {
    console.error('短信发送错误:', error);
    return NextResponse.json({
      error: '发送验证码失败'
    }, { status: 500 });
  }
}
