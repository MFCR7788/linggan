// Kokoro TTS — 本地部署（sherpa-onnx + Kokoro-82M）
// 部署位置: deploy/kokoro/ (Docker on ECS, port 8880)
// 8 种中文音色，免费 0 credits

import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult, TtsVoice } from '../types';

const DEFAULT_URL = 'http://localhost:8880';

function getBaseUrl(): string {
  return process.env.KOKORO_API_URL || DEFAULT_URL;
}

const VOICES: TtsVoice[] = [
  { id: 'zf_xiaobei', name: '小北(女)', language: 'zh-CN', gender: 'female' },
  { id: 'zf_xiaoni', name: '小妮(女)', language: 'zh-CN', gender: 'female' },
  { id: 'zf_xiaoxiao', name: '晓晓(女)', language: 'zh-CN', gender: 'female' },
  { id: 'zf_xiaoyi', name: '小艺(女)', language: 'zh-CN', gender: 'female' },
  { id: 'zm_yunjian', name: '云健(男)', language: 'zh-CN', gender: 'male' },
  { id: 'zm_yunxi', name: '云希(男)', language: 'zh-CN', gender: 'male' },
  { id: 'zm_yunxia', name: '云夏(男)', language: 'zh-CN', gender: 'male' },
  { id: 'zm_yunyang', name: '云扬(男)', language: 'zh-CN', gender: 'male' },
];

export const kokoroProvider: TtsProvider = {
  id: 'kokoro',
  name: 'Kokoro (本地)',
  isLocal: true,
  healthCheckUrl: `${getBaseUrl()}/health`,

  async getVoices(): Promise<TtsVoice[]> {
    // 尝试从 API 获取最新音色列表
    try {
      const res = await fetch(`${getBaseUrl()}/v1/audio/voices`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.voices)) {
          return data.voices.map((v: { id: string; name: string }) => ({
            id: v.id,
            name: v.name || v.id,
            language: 'zh-CN',
          }));
        }
      }
    } catch { /* fallback */ }
    return VOICES;
  },

  async synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const res = await fetch(`${getBaseUrl()}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: options.text,
        voice: options.voice,
        speed: options.speed || 1.0,
        response_format: options.format || 'mp3',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`Kokoro 合成失败: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      audioBuffer: buffer,
      mimeType: `audio/${options.format || 'mpeg'}`,
      provider: 'kokoro',
    };
  },

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
