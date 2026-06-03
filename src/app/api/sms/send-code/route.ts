import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import Dysmsapi from '@alicloud/dysmsapi20170525';
import { Config } from '@alicloud/openapi-client';

export const dynamic = 'force-dynamic';

const DEV_CODE = '123456';
const CODE_EXPIRY_MINUTES = 30;
const SMS_TEMPLATE_CODE = process.env.ALIYUN_SMS_TEMPLATE_CODE || 'SMS_506745050';
const SMS_SIGN_NAME = process.env.ALIYUN_SMS_SIGN_NAME || '魔法超人';

export async function POST(request: Request) {
  try {
    const { phone, captchaToken } = await request.json();

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }
    if (!captchaToken) {
      return NextResponse.json({ error: '请先完成滑块验证' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date();

    // 1. 验证 captcha_token
    const { data: captcha, error: captchaError } = await supabase
      .from('slider_captchas')
      .select('*')
      .eq('token', captchaToken)
      .single();

    if (captchaError || !captcha) {
      return NextResponse.json({ error: '滑块验证无效, 请刷新' }, { status: 400 });
    }
    if (!captcha.used) {
      // 异常: verify 后应已标记 used=true
      return NextResponse.json({ error: '滑块未通过验证' }, { status: 400 });
    }
    if (new Date(captcha.expires_at) < now) {
      return NextResponse.json({ error: '滑块验证已过期' }, { status: 400 });
    }

    // 2. 清理全局过期验证码
    await supabase
      .from('verification_codes')
      .delete()
      .lt('created_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString());

    // 3. 清理当前手机号的所有验证码
    await supabase
      .from('verification_codes')
      .delete()
      .eq('phone', phone);

    // 4. 生成 6 位随机数字验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));

    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        phone,
        code,
        used: false,
        expires_at: new Date(now.getTime() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error('验证码存储失败:', insertError);
      return NextResponse.json({ error: '服务暂时不可用' }, { status: 500 });
    }

    // 5. 发送短信 (阿里云)
    const regionId = process.env.ALIYUN_SMS_REGION_ID || 'cn-hangzhou';
    const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;

    let sent = false;
    let sendError: string | undefined;

    if (accessKeyId && accessKeySecret) {
      try {
        const config = new Config({
          accessKeyId,
          accessKeySecret,
          regionId,
          endpoint: `dysmsapi.${regionId}.aliyuncs.com`,
        });
        const client = new Dysmsapi(config);
        const result = await client.sendSms({
          phoneNumbers: phone,
          signName: SMS_SIGN_NAME,
          templateCode: SMS_TEMPLATE_CODE,
          templateParam: JSON.stringify({ code }),
        } as any);
        if (result.body.code === 'OK') {
          sent = true;
        } else {
          sendError = result.body.message || '未知短信错误';
        }
      } catch (e) {
        sendError = e instanceof Error ? e.message : '短信 SDK 异常';
      }
    } else {
      sendError = '未配置 ALIYUN_SMS_ACCESS_KEY_ID / SECRET';
    }

    // 即使短信发送失败, 验证码已存; 生产环境考虑告警
    if (!sent) {
      console.error('[SMS] 发送失败:', sendError);
      return NextResponse.json({
        success: true,
        message: `验证码已生成 (短信发送失败: ${sendError})`,
        // 开发/排错时把验证码回显
        code: process.env.NODE_ENV === 'development' ? code : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送',
      // 开发模式回显
      code: process.env.NODE_ENV === 'development' ? code : undefined,
    });
  } catch (error) {
    console.error('短信发送错误:', error);
    return NextResponse.json({ error: '发送验证码失败' }, { status: 500 });
  }
}
