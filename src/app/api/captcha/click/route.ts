// 点击文字验证码 API
// GET  /api/captcha/click   - 生成新挑战 (随机 6 字 + 提示按顺序点击其中 3 字)
// POST /api/captcha/click   - 验证用户点击坐标, 返回 captchaToken (供 /api/sms/send-code 用)
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { generateChallenge } from '@/lib/captcha/text-click';

export const dynamic = 'force-dynamic';

const CHALLENGE_TTL_MIN = 5;
const TOKEN_TTL_MIN = 5; // 通行证有效期 (送 send-code 前)

export async function GET() {
  try {
    const seed = Math.floor(Math.random() * 1_000_000);
    const ch = generateChallenge(seed);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000);

    // 计算目标字符在 positions 数组中的下标 (用 expected 字符回查)
    const expectedIndices: number[] = [];
    for (const target of ch.expected) {
      const idx = ch.positions.findIndex((p, i) => p.char === target && !expectedIndices.includes(i));
      expectedIndices.push(idx);
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('click_captchas').insert({
      token,
      positions: ch.positions,
      expected_indices: expectedIndices,
      width: ch.width,
      height: ch.height,
      hit_radius: ch.hitRadius,
      used: false,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      console.error('[ClickCaptcha] 存储失败:', error);
      return NextResponse.json({ error: '生成验证码失败', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({
      token,
      width: ch.width,
      height: ch.height,
      bgImage: ch.bgImage,
      expected: ch.expected, // 客户端要显示 "请依次点击: X Y Z"
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    // createAdminClient() 在 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 缺失时会抛错。
    // 不捕获则 Next.js 返回空 body 500，前端 res.json() 报 "Unexpected end of JSON input"。
    console.error('[ClickCaptcha] GET 错误:', err);
    return NextResponse.json(
      { error: '生成验证码失败', detail: String(err) },
      { status: 500 }
    );
  }
}

interface ClickPoint { x: number; y: number; }

export async function POST(request: NextRequest) {
  try {
    const { token, clicks } = await request.json() as { token?: string; clicks?: ClickPoint[] };
    if (!token || !Array.isArray(clicks)) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('click_captchas')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) return NextResponse.json({ error: '验证码无效' }, { status: 400 });
    if (data.used) return NextResponse.json({ error: '验证码已使用' }, { status: 400 });
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: '验证码已过期' }, { status: 400 });
    }

    const expected: number[] = data.expected_indices;
    if (clicks.length !== expected.length) {
      return NextResponse.json({ error: '点击数量不符' }, { status: 400 });
    }

    // 按顺序逐个比对: 第 i 个点击坐标 vs positions[expected[i]] 的中心
    const positions: { char: string; x: number; y: number }[] = data.positions;
    const radius: number = data.hit_radius;
    for (let i = 0; i < expected.length; i++) {
      const target = positions[expected[i]];
      const click = clicks[i];
      if (!target || !click) {
        return NextResponse.json({ error: '位置数据缺失' }, { status: 400 });
      }
      const dist = Math.hypot(click.x - target.x, click.y - target.y);
      if (dist > radius) {
        return NextResponse.json({ error: '位置不对, 请重试' }, { status: 400 });
      }
    }

    // 标记 challenge used
    await supabase.from('click_captchas').update({ used: true }).eq('token', token);

    // 写入通行证 (send-code 据此放行)
    const passToken = crypto.randomBytes(24).toString('hex');
    const passExpires = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
    const { error: insertError } = await supabase.from('captcha_tokens').insert({
      token: passToken,
      kind: 'click',
      used: false,
      expires_at: passExpires.toISOString(),
    });

    if (insertError) {
      console.error('[ClickCaptcha] 通行证写入失败:', insertError);
      return NextResponse.json({ error: '签发通行证失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, captchaToken: passToken });
  } catch (err) {
    console.error('[ClickCaptcha] verify 错误:', err);
    return NextResponse.json({ error: '验证失败' }, { status: 500 });
  }
}
