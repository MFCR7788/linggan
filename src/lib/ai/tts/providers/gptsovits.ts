// GPT-SoVITS 本地 TTS — 少样本语音克隆
// 部署位置: deploy/gptsovits/ (Docker, port 9880)
// 特点: 需要参考音频，可克隆任意声音

import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult, TtsVoice } from '../types';

const DEFAULT_URL = 'http://localhost:9880';

function getBaseUrl(): string {
  return process.env.GPTSOVITS_API_URL || DEFAULT_URL;
}

export const gptsovitsProvider: TtsProvider = {
  id: 'gptsovits',
  name: 'GPT-SoVITS (本地)',
  isLocal: true,
  healthCheckUrl: `${getBaseUrl()}/health`,

  async getVoices(): Promise<TtsVoice[]> {
    try {
      const res = await fetch(`${getBaseUrl()}/voices`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((v: { name: string; lang?: string }) => ({
            id: v.name,
            name: v.name,
            language: v.lang || 'zh-CN',
          }));
        }
      }
    } catch { /* fallback */ }
    return [
      { id: 'default', name: '默认音色', language: 'zh-CN', description: '需要配置参考音频' },
    ];
  },

  async synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const res = await fetch(`${getBaseUrl()}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: options.text,
        voice: options.voice,
        speed: options.speed || 1.0,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      throw new Error(`GPT-SoVITS 合成失败: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      audioBuffer: buffer,
      mimeType: 'audio/wav',
      provider: 'gptsovits',
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
