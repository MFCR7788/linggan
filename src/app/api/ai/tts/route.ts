// TTS (Text-to-Speech) API — 百炼 CosyVoice v2 / v3-flash
import { NextResponse } from 'next/server';
import { synthesizeWithCosyVoice } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAiTtsCost } from '@/lib/credit-costs';
import { saveWorkHistory } from '@/lib/supabase-server';

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

/** 按标点切分长文本，每段不超过 maxChars 个字符 */
function splitText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    // 在 maxChars 范围内找最后一个标点作为断点
    let cutAt = maxChars;
    const searchRange = remaining.slice(0, maxChars);
    const punctMatch = searchRange.match(/[。！？；\n!?;](?!.*[。！？；\n!?;])/);
    if (punctMatch && punctMatch.index !== undefined && punctMatch.index > maxChars * 0.5) {
      cutAt = punctMatch.index + 1;
    } else {
      // 退而找逗号
      const commaMatch = searchRange.match(/[，、,](?!.*[，、,])/);
      if (commaMatch && commaMatch.index !== undefined && commaMatch.index > maxChars * 0.5) {
        cutAt = commaMatch.index + 1;
      }
    }
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  return chunks;
}

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

    // 最大 4500 字节 (~1500 中文字)，足够生成 2-3 分钟口播配音
    const textBytes = Buffer.byteLength(text, 'utf-8');
    const MAX_BYTES = 4500;
    if (textBytes > MAX_BYTES) {
      return NextResponse.json({
        success: false,
        error: `文本过长（${textBytes}/${MAX_BYTES} 字节，约 ${Math.floor(MAX_BYTES / 3)} 字），请分段生成`,
      }, { status: 400 });
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
            error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
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

    // CosyVoice v2 单次上限 ~300 中文字，长文本自动分段合成后拼接
    const MAX_CHARS_PER_CALL = 250;
    const chunks = splitText(text, MAX_CHARS_PER_CALL);
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.trim()) continue;
      const audio = await synthesizeWithCosyVoice({
        text: chunk,
        options: {
          voice: voiceConfig.id as any,
          speed: speedRatio,
          pitch: pitchRatio,
        },
      });
      if (!audio) {
        await refund(user.id, creditCost, 'ai_tts', `CosyVoice 合成失败退点(第${i + 1}段)`, { chars: text.length });
        return NextResponse.json({
          success: false,
          error: `语音合成失败（第 ${i + 1}/${chunks.length} 段），请稍后重试`,
        }, { status: 502 });
      }
      audioBuffers.push(audio);
    }

    const mergedAudio = audioBuffers.length === 1
      ? audioBuffers[0]
      : Buffer.concat(audioBuffers);

    // 保存到历史生成（不存 base64，仅元信息）
    await saveWorkHistory(user.id, text.substring(0, 200), {
      generatedAudio: {
        voice: voiceConfig.label,
        engine: 'cosyvoice',
        textLength: text.length,
      },
      voice: voiceConfig.label,
      creditsUsed: creditCost,
    });

    return NextResponse.json({
      success: true,
      audioBase64: mergedAudio.toString('base64'),
      mimeType: 'audio/mpeg',
      voice: voiceConfig.label,
      engine: 'cosyvoice',
      creditsUsed: creditCost,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return NextResponse.json({ success: false, error: '语音合成服务错误' }, { status: 500 });
  }
});
