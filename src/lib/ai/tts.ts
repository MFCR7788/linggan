// AI Services - 百炼 CosyVoice TTS

import { fetchWithTimeout, getDashScopeApiKey } from './constants';
import type {
  CosyVoiceId,
  CosyVoiceModel,
  CosyVoiceOptions,
} from './types';

// ====== 百炼 CosyVoice TTS ======
// DashScope 同步 HTTP API: POST /api/v1/services/audio/tts/SpeechSynthesizer
// 流程: POST → 返回 JSON 含 output.audio.url(OSS) → GET 拿 MP3 bytes
// 音色: cosyvoice-v2 需带 _v2 后缀(longxiaochun_v2), v3-flash 不带后缀

export async function synthesizeWithCosyVoice(params: {
  text: string;
  options?: CosyVoiceOptions;
}): Promise<Buffer | null> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) {
    console.warn('[CosyVoice] DASHSCOPE_API_KEY 未配置');
    return null;
  }

  const {
    voice = 'longxiaochun_v2',
    speed = 1.0,
    pitch = 1.0,
    volume = 50,
    model = 'cosyvoice-v2',
  } = params.options || {};

  try {
    const response = await fetchWithTimeout('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: {
          text: params.text,
          voice,
          format: 'mp3',
          sample_rate: 24000,
          rate: speed,
          pitch,
          volume,
        },
      }),
    }, 30000);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[CosyVoice] HTTP ${response.status}:`, errText.slice(0, 300));
      return null;
    }

    const json = await response.json() as { code?: number; message?: string; output?: { audio?: { url?: string } } };
    if (json.code) {
      console.error(`[CosyVoice] 业务错误 code=${json.code}:`, json.message);
      return null;
    }

    const audioUrl = json?.output?.audio?.url;
    if (!audioUrl) {
      console.warn('[CosyVoice] 响应中无 audio.url:', JSON.stringify(json).slice(0, 200));
      return null;
    }

    const audioResp = await fetchWithTimeout(audioUrl, {}, 30000);
    if (!audioResp.ok) {
      console.error(`[CosyVoice] 下载音频失败 HTTP ${audioResp.status}`);
      return null;
    }

    const ab = await audioResp.arrayBuffer();
    if (ab.byteLength < 100) {
      console.warn('[CosyVoice] 返回音频过小,可能合成失败');
      return null;
    }
    return Buffer.from(ab);
  } catch (e: unknown) {
    console.warn('[CosyVoice] 调用失败:', e instanceof Error ? e.message : e);
    return null;
  }
}
