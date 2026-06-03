// TTS (Text-to-Speech) API — 通过火山引擎语音合成（豆包 TTS）
import { NextRequest, NextResponse } from 'next/server';
import https from 'https';

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

export async function GET(request: NextRequest) {
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
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice, speed, pitch } = await request.json();

    if (!text || text.length === 0) {
      return NextResponse.json({ success: false, error: '文本不能为空' }, { status: 400 });
    }

    if (text.length > 2000) {
      return NextResponse.json({ success: false, error: '文本过长（最多 2000 字）' }, { status: 400 });
    }

    if (!APP_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, error: 'TTS 服务未配置' }, { status: 500 });
    }

    const voiceConfig = VOICE_MAP[voice] || VOICE_MAP[DEFAULT_VOICE];
    const speedRatio = Math.min(Math.max(Number(speed) || DEFAULT_SPEED, 0.5), 2.0);
    const pitchRatio = Math.min(Math.max(Number(pitch) || DEFAULT_PITCH, 0.5), 2.0);

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

    const result = await new Promise<any>((resolve, reject) => {
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

    if (!result.ok || result.status !== 200) {
      console.error('[TTS] Volcengine HTTP error:', result.status, JSON.stringify(result.body).slice(0, 200));
      const detail = typeof result.body === 'object' ? (result.body.message || JSON.stringify(result.body).slice(0, 100)) : String(result.body).slice(0, 100);
      return NextResponse.json({ success: false, error: `语音合成失败(HTTP ${result.status}): ${detail}` }, { status: 502 });
    }

    const body = result.body;
    if (body.code !== 3000) {
      console.error('[TTS] Volcengine business error:', body.code, body.message);
      return NextResponse.json({ success: false, error: `语音合成失败(code ${body.code}): ${body.message || '未知原因'}` }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      audioBase64: body.data,
      mimeType: 'audio/mpeg',
      voice: voiceConfig.label,
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return NextResponse.json({ success: false, error: '语音合成服务错误' }, { status: 500 });
  }
}
