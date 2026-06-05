// TTS (Text-to-Speech) API — 百炼 CosyVoice v2
import { NextResponse } from 'next/server';
import { synthesizeWithCosyVoice } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAiTtsCost } from '@/lib/credit-costs';

// 音色列表 — CosyVoice v2 预设
const VOICE_MAP: Record<string, { id: string; label: string; language: string }> = {
  female_natural: { id: 'longxiaochun_v2', label: '龙小淳(温柔女声·默认)', language: 'zh' },
  female_emotional: { id: 'longxiaoxia_v2', label: '龙小夏(活泼女声)', language: 'zh' },
  female_professional: { id: 'longxiaoyu_v2', label: '龙小玉(知性女声)', language: 'zh' },
  female_warm: { id: 'longhua_v2', label: '龙华(暖声女声)', language: 'zh' },
  male_natural: { id: 'longyue_v2', label: '龙悦(磁性质声)', language: 'zh' },
  male_warm: { id: 'longcheng_v2', label: '龙橙(暖声男声)', language: 'zh' },
  male_professional: { id: 'longjing_v2', label: '龙靖(沉稳男声)', language: 'zh' },
};

const DEFAULT_VOICE = 'female_natural';
const DEFAULT_SPEED = 1.15;
const DEFAULT_PITCH = 1.0;

export const GET = withAuth(async ({ request, user: _user }) => {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('language');
  const voices = Object.entries(VOICE_MAP)
    .filter(([, v]) => !lang || v.language === lang)
    .map(([key, { id, label, language }]) => ({
      key,
      id,
      label,
      language,
    }));
  return NextResponse.json({ success: true, data: { voices } });
});

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { text, voice, speed, pitch } = await request.json();

    if (!text || text.length === 0) {
      return NextResponse.json({ success: false, error: '文本不能为空' }, { status: 400 });
    }

    const textBytes = Buffer.byteLength(text, 'utf-8');
    if (textBytes > 1000) {
      return NextResponse.json({ success: false, error: `文本过长（${textBytes}/1000 字节）` }, { status: 400 });
    }

    // 扣点(预扣)
    const creditCost = calcAiTtsCost(text.length);
    try {
      await consume(user.id, creditCost, 'ai_tts', `AI 配音 ${text.length} 字`, {
        chars: text.length,
        voice: voice || DEFAULT_VOICE,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: creditCost, available: e.available },
          },
          { status: 402 }
        );
      }
      throw e;
    }

    const speedRatio = Math.min(Math.max(Number(speed) || DEFAULT_SPEED, 0.5), 2.0);
    const pitchRatio = Math.min(Math.max(Number(pitch) || DEFAULT_PITCH, 0.5), 2.0);
    const voiceConfig = VOICE_MAP[voice] || VOICE_MAP[DEFAULT_VOICE];

    // CosyVoice — 百炼 DashScope
    const audio = await synthesizeWithCosyVoice({
      text,
      options: {
        voice: voiceConfig.id as any,
        speed: speedRatio,
        pitch: pitchRatio,
      },
    });

    if (!audio) {
      await refund(user.id, creditCost, 'ai_tts', 'CosyVoice 合成失败退点', { chars: text.length });
      return NextResponse.json({ success: false, error: '语音合成失败，请稍后重试' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      audioBase64: audio.toString('base64'),
      mimeType: 'audio/mpeg',
      voice: voiceConfig.label,
      engine: 'cosyvoice',
      creditsUsed: creditCost,
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return NextResponse.json({ success: false, error: '语音合成服务错误' }, { status: 500 });
  }
});
