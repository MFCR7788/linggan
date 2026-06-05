'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────

export interface DHSubmitParams {
  text?: string;
  imageUrl: string;
  audioUrl: string;
  resolution?: string;
  audioDuration?: number;
}

export interface DHSubmitResult {
  taskId: string;
}

export interface DHPollResult {
  status: string;
  videoUrl?: string;
}

export interface ScriptGenParams {
  topic?: string;
  style?: string;
  count?: number;
  language?: string;
}

export function useDigitalHuman() {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'generating' | 'done' | 'error'>('idle');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const cancelPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const submit = useCallback(async (params: DHSubmitParams): Promise<DHSubmitResult> => {
    setGenerating(true);
    setPhase('submitting');
    setVideoUrl(null);
    setError(null);
    cancelPolling();

    try {
      const res = await apiClient.post<{ taskId: string }>('/ai/digital-human', {
        text: params.text || '',
        imageUrl: params.imageUrl,
        audioUrl: params.audioUrl,
        resolution: params.resolution || undefined,
        audioDuration: params.audioDuration || undefined,
      });
      if (!res.success) throw new Error(res.error || '提交失败');

      const id = res.data!.taskId;
      setTaskId(id);
      setPhase('generating');

      // Start polling
      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          cancelPolling();
          setError('生成超时，请重试');
          setPhase('error');
          return;
        }
        try {
          const pollRes = await apiClient.get<DHPollResult>(`/ai/digital-human?taskId=${id}`);
          if (pollRes.success && pollRes.data) {
            if (pollRes.data.status === 'succeeded' && pollRes.data.videoUrl) {
              cancelPolling();
              setVideoUrl(pollRes.data.videoUrl);
              setPhase('done');
              setGenerating(false);
            } else if (pollRes.data.status === 'failed') {
              cancelPolling();
              setError('数字人生成失败');
              setPhase('error');
              setGenerating(false);
            }
          }
        } catch { /* polling errors are non-fatal */ }
      }, 5000);

      return { taskId: id };
    } catch (e: any) {
      setError(e.message || '提交失败');
      setPhase('error');
      setGenerating(false);
      throw e;
    }
  }, [cancelPolling]);

  const generateScript = useCallback(async (params: ScriptGenParams): Promise<string[]> => {
    try {
      const res = await apiClient.post<{ scripts?: string[]; content?: string[] }>('/ai/digital-human/script', {
        topic: params.topic || '',
        style: params.style || '',
        count: params.count || 1,
        language: params.language || 'zh',
      });
      if (res.success && res.data) {
        return res.data.scripts || res.data.content || [];
      }
      return [];
    } catch {
      return [];
    }
  }, []);

  return {
    submit, generateScript, cancelPolling,
    generating, phase, taskId, videoUrl,
    error, setError,
    setPhase, setVideoUrl,
  };
}
