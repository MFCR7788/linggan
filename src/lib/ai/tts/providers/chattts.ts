// ChatTTS 本地 TTS — 开源对话式 TTS 模型
// 部署位置: deploy/chattts/ (Docker, port 8080)
// 特点: 自然对话风格，适合口播/日常视频配音

import type { TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult, TtsVoice } from '../types';

const DEFAULT_URL = 'http://localhost:8080';

function getBaseUrl(): string {
  return process.env.CHATTTS_API_URL || DEFAULT_URL;
}

const VOICES: TtsVoice[] = [
  { id: 'default', name: '默认音色', language: 'zh-CN', description: '自然对话风格，适合口播' },
  { id: 'female1', name: '女声1(温柔)', language: 'zh-CN', gender: 'female' },
  { id: 'female2', name: '女声2(活泼)', language: 'zh-CN', gender: 'female' },
  { id: 'male1', name: '男声1(沉稳)', language: 'zh-CN', gender: 'male' },
  { id: 'male2', name: '男声2(阳光)', language: 'zh-CN', gender: 'male' },
];

export const chatttsProvider: TtsProvider = {
  id: 'chattts',
  name: 'ChatTTS (本地)',
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
    return VOICES;
  },

  async synthesize(options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const res = await fetch(`${getBaseUrl()}/synthesize`, {
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
      throw new Error(`ChatTTS 合成失败: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      audioBuffer: buffer,
      mimeType: 'audio/wav',
      provider: 'chattts',
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
