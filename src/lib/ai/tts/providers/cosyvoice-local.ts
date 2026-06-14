// CosyVoice 本地 TTS — 阿里开源 CosyVoice 本地部署
// 特点: 与云端 CosyVoice 兼容的音色，但本地运行免扣点

import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult, TtsVoice } from '../types';

const DEFAULT_URL = 'http://localhost:50000';

function getBaseUrl(): string {
  return process.env.COSYVOICE_LOCAL_URL || DEFAULT_URL;
}

export const cosyvoiceLocalProvider: TtsProvider = {
  id: 'cosyvoice-local',
  name: 'CosyVoice (本地)',
  isLocal: true,
  healthCheckUrl: `${getBaseUrl()}/health`,

  async getVoices(): Promise<TtsVoice[]> {
    try {
      const res = await fetch(`${getBaseUrl()}/voices`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch { /* fallback */ }
    return [
      { id: '中文女', name: '中文女', language: 'zh-CN', gender: 'female' },
      { id: '中文男', name: '中文男', language: 'zh-CN', gender: 'male' },
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
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`CosyVoice 本地合成失败: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      audioBuffer: buffer,
      mimeType: 'audio/wav',
      provider: 'cosyvoice-local',
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
