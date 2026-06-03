// TTS (Text-to-Speech) API — 通过火山引擎语音合成（豆包 TTS）
import { NextResponse } from 'next/server';
import https from 'https';
import { synthesizeWithClonedVoice } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, refund, InsufficientCreditsError } from '@/lib/credits';
import { calcAiTtsCost, CREDIT_COSTS } from '@/lib/credit-costs';

const APP_ID = process.env.VOLC_TTS_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_TTS_ACCESS_TOKEN;
const TTS_HOST = 'openspeech.bytedance.com';
const TTS_PATH = '/api/v1/tts';

// 音色列表 — 全部为当前账号已授权的音色
// BV700=灿灿(女), BV007=亲切女声, BV405=甜美小源(女), BV009=知性女声(女)
// BV701=擎苍(男), BV008=亲切男声
const VOICE_MAP: Record<string, { id: string; label: string; language: string }> = {
  female_standard: { id: 'BV700_V2_streaming', label: '标准女声', language: 'zh' },
  female_natural: { id: 'BV007_streaming', label: '自然女声', language: 'zh' },
  female_emotional: { id: 'BV405_streaming', label: '甜美女声', language: 'zh' },
  female_professional: { id: 'BV009_streaming', label: '知性女声', language: 'zh' },
  male_standard: { id: 'BV701_V2_streaming', label: '标准男声', language: 'zh' },
  male_natural: { id: 'BV008_streaming', label: '自然男声', language: 'zh' },
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
    const { text, voice, speed, pitch, cloned_voice_id: clonedVoiceId } = await request.json();

    if (!text || text.length === 0) {
      return NextResponse.json({ success: false, error: '文本不能为空' }, { status: 400 });
    }

    // 火山引擎限制: 单次请求文本 ≤ 1024 字节(utf-8), 超过会返 "exceed max len limit"
    // 留 24 字节余量到 1000, 避免边界失败
    const textBytes = Buffer.byteLength(text, 'utf-8');
    if (textBytes > 1000) {
      return NextResponse.json({ success: false, error: `文本过长（${textBytes}/1000 字节, 约 ${text.length} 字符, 请精简到 1000 字节以内）` }, { status: 400 });
    }

    if (!APP_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, error: 'TTS 服务未配置' }, { status: 500 });
    }

    // ─── 扣点(预扣) ──────────────────────────────────
    const creditCost = calcAiTtsCost(text.length);
    try {
      await consume(user.id, creditCost, 'ai_tts', `AI 配音 ${text.length} 字`, {
        chars: text.length,
        voice: voice || DEFAULT_VOICE,
        isCloned: voice === 'cloned_voice' && !!clonedVoiceId,
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

    // 声音克隆分支:voice === 'cloned_voice' 且 client 传了 cloned_voice_id
    if (voice === 'cloned_voice' && clonedVoiceId) {
      try {
        const audioBuffer = await synthesizeWithClonedVoice({
          text,
          speakerId: clonedVoiceId,
          speed: speedRatio,
          pitch: pitchRatio,
        });
        if (!audioBuffer) {
          // 退点
          await refund(user.id, creditCost, 'ai_tts', '克隆音色合成失败退点', { chars: text.length });
          return NextResponse.json({ success: false, error: '克隆音色合成失败,请检查音色 ID 是否有效' }, { status: 502 });
        }
        return NextResponse.json({
          success: true,
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mpeg',
          voice: '我的克隆',
          isCloned: true,
          creditsUsed: creditCost,
        });
      } catch (e: any) {
        // 退点
        await refund(user.id, creditCost, 'ai_tts', '克隆音色调用失败退点', { chars: text.length, error: String(e?.message) });
        return NextResponse.json({ success: false, error: `克隆音色调用失败: ${e?.message || '未知错误'}` }, { status: 502 });
      }
    }

    const voiceConfig = VOICE_MAP[voice] || VOICE_MAP[DEFAULT_VOICE];

    const requestId = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const postData = JSON.stringify({
      app: {
        appid: APP_ID,
        token: ACCESS_TOKEN,
        cluster: 'volcano_tts',
      },
      user: {
        uid: 'lingji',
      },
      audio: {
        voice_type: voiceConfig.id,
        encoding: 'mp3',
        rate: 24000,
        speed_ratio: speedRatio,
        pitch_ratio: pitchRatio,
        volume_ratio: 1.0,
      },
      request: {
        reqid: requestId,
        text,
        text_type: 'plain',
        operation: 'query',
      },
    });

    let result: { ok: boolean; status: number; body: any };
    try {
      result = await new Promise<any>((resolve, reject) => {
        const req = https.request({
          hostname: TTS_HOST,
          path: TTS_PATH,
          method: 'POST',
          headers: {
            'Authorization': `Bearer; ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ ok: res.statusCode === 200, status: res.statusCode, body: parsed });
            } catch {
              resolve({ ok: false, status: res.statusCode, body: data });
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
      });
    } catch (e: any) {
      // 网络错误,退点
      await refund(user.id, creditCost, 'ai_tts', 'TTS 网络错误退点', { chars: text.length, error: String(e?.message) });
      return NextResponse.json({ success: false, error: `TTS 网络错误: ${e?.message || '未知'}` }, { status: 502 });
    }

    if (!result.ok || result.status !== 200) {
      console.error('[TTS] Volcengine HTTP error:', result.status, JSON.stringify(result.body).slice(0, 200));
      const detail = typeof result.body === 'object' ? (result.body.message || JSON.stringify(result.body).slice(0, 100)) : String(result.body).slice(0, 100);
      // 退点
      await refund(user.id, creditCost, 'ai_tts', 'TTS 上游错误退点', { chars: text.length, httpStatus: result.status });
      return NextResponse.json({ success: false, error: `语音合成失败(HTTP ${result.status}): ${detail}` }, { status: 502 });
    }

    const body = result.body;
    if (body.code !== 3000) {
      console.error('[TTS] Volcengine business error:', body.code, body.message);
      // 退点
      await refund(user.id, creditCost, 'ai_tts', 'TTS 业务错误退点', { chars: text.length, upstreamCode: body.code, upstreamMsg: body.message });
      return NextResponse.json({ success: false, error: `语音合成失败(code ${body.code}): ${body.message || '未知原因'}` }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      audioBase64: body.data,
      mimeType: 'audio/mpeg',
      voice: voiceConfig.label,
      creditsUsed: creditCost,
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return NextResponse.json({ success: false, error: '语音合成服务错误' }, { status: 500 });
  }
});
