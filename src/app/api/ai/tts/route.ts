// TTS (Text-to-Speech) API — 通过火山引擎语音合成（豆包 TTS）
import { NextRequest, NextResponse } from 'next/server';

const APP_ID = process.env.VOLC_TTS_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_TTS_ACCESS_TOKEN;
const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts';

// 推荐中文音色（统一女声）：
// BV700_V2_streaming  — 标准女声
// BV570_V2_streaming  — 情感女声（更自然）
const VOICE_TYPE = 'BV701_V2_streaming';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || text.length === 0) {
      return NextResponse.json({ success: false, error: '文本不能为空' }, { status: 400 });
    }

    if (text.length > 2000) {
      return NextResponse.json({ success: false, error: '文本过长（最多 2000 字）' }, { status: 400 });
    }

    if (!APP_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, error: 'TTS 服务未配置' }, { status: 500 });
    }

    const requestId = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const response = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer; ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app: {
          appid: APP_ID,
          token: ACCESS_TOKEN,
          cluster: 'volcano_tts',
        },
        user: {
          uid: 'lingji',
        },
        audio: {
          voice_type: VOICE_TYPE,
          encoding: 'mp3',
          rate: 24000,
          speed_ratio: 1.15,
          pitch_ratio: 1.0,
          volume_ratio: 1.0,
        },
        request: {
          reqid: requestId,
          text,
          text_type: 'plain',
          operation: 'query',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] Volcengine error:', response.status, errorText);
      return NextResponse.json({ success: false, error: '语音合成失败' }, { status: 502 });
    }

    const result = await response.json();

    if (result.code !== 3000) {
      console.error('[TTS] Volcengine error:', result.code, result.message);
      return NextResponse.json({ success: false, error: '语音合成失败' }, { status: 502 });
    }

    // data 是 base64 编码的音频
    return NextResponse.json({
      success: true,
      audioBase64: result.data,
      mimeType: 'audio/mpeg',
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return NextResponse.json({ success: false, error: '语音合成服务错误' }, { status: 500 });
  }
}
