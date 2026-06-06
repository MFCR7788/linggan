'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface VoiceOption {
  key?: string;
  id?: string;
  label: string;
  gender?: string;
  [k: string]: unknown;
}

export interface TtsParams {
  text: string;
  voice: string;
  speed?: number;
  pitch?: number;
  clonedVoiceId?: string;
}

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
}

export function useTts() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ voices: VoiceOption[] }>('/ai/tts')
      .then((res) => { if (res.success) setVoices(res.data!.voices || []); })
      .catch(() => {});
  }, []);

  const generate = useCallback(async (params: TtsParams): Promise<TtsResult> => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<TtsResult>('/ai/tts', {
        text: params.text,
        voice: params.voice,
        speed: params.speed,
        pitch: params.pitch,
        cloned_voice_id: params.voice === 'cloned_voice' ? params.clonedVoiceId : undefined,
      });
      if (!res.success) throw new Error(res.error || '生成失败');
      return {
        audioBase64: (res as any).audioBase64,
        mimeType: (res as any).mimeType || 'audio/mpeg',
      };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { voices, generate, generating, error, setError };
}
