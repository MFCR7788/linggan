// 滑块验证码 API
// GET  /api/captcha/slider        - 生成新滑块
// POST /api/captcha/slider        - 验证用户拖动坐标, 返回 captcha_token (供 /api/sms/send-code 使用)
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { generatePuzzle, svgToDataUrl, type SliderPuzzle } from '@/lib/captcha/svg';

export const dynamic = 'force-dynamic';

const TTL_MINUTES = 5;
const TOLERANCE_PX = 5; // 误差容忍

export async function GET() {
  const seed = Math.floor(Math.random() * 1_000_000);
  const puzzle: SliderPuzzle = generatePuzzle(seed);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  // 存到 Supabase
  const supabase = createAdminClient();
  const { error } = await supabase.from('slider_captchas').insert({
    token,
    puzzle_x: puzzle.puzzleX,
    puzzle_y: puzzle.puzzleY,
    used: false,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[Captcha] 存储失败:', error);
    return NextResponse.json({ error: '生成验证码失败' }, { status: 500 });
  }

  return NextResponse.json({
    token,
    width: puzzle.width,
    height: puzzle.height,
    puzzleSize: puzzle.puzzleSize,
    bgImage: svgToDataUrl(puzzle.bgSvg),
    puzzleImage: svgToDataUrl(puzzle.puzzleSvg),
    // puzzleX 故意不发(校验用); puzzleY 必须发, 前端按此 Y 定位拼图块, 否则上下对不齐
    puzzleY: puzzle.puzzleY,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { token, x } = await request.json();
    if (!token || typeof x !== 'number') {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('slider_captchas')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '验证码无效' }, { status: 400 });
    }
    if (data.used) {
      return NextResponse.json({ error: '验证码已使用' }, { status: 400 });
    }
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: '验证码已过期' }, { status: 400 });
    }

    // 误差容忍 ±5px
    const diff = Math.abs(x - data.puzzle_x);
    if (diff > TOLERANCE_PX) {
      return NextResponse.json({ error: '位置不对, 再试一次', offset: diff }, { status: 400 });
    }

    // 标记已用 (防重放)
    await supabase
      .from('slider_captchas')
      .update({ used: true })
      .eq('token', token);

    return NextResponse.json({
      success: true,
      captchaToken: token, // 后续 send-code 验证用
    });
  } catch (err) {
    console.error('[Captcha] verify 错误:', err);
    return NextResponse.json({ error: '验证失败' }, { status: 500 });
  }
}
