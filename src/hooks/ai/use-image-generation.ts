'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface SmartPromptParams {
  userInput: string;
  presetId?: string;
  style?: string;
  ratio?: string;
  inspirations?: { title: string; originalText?: string; aiSummary?: string }[];
  paletteName?: string;
}

export interface ImageGenParams {
  prompt: string;
  presetId?: string;
  style?: string;
  ratio?: string;
  n?: number;
  paletteId?: string;
  seed?: string;
  negativePrompt?: string;
}

export interface ImageGenResult {
  imageUrl?: string;
  batchImages?: string[];
}

export function useImageGeneration() {
  const [refining, setRefining] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refinePrompt = useCallback(async (params: SmartPromptParams): Promise<string> => {
    setRefining(true);
    setError(null);
    try {
      const res = await apiClient.post<{ prompt: string }>('/ai/image/smart-prompt', {
        inspirations: (params.inspirations || []).map(i => ({
          title: i.title,
          originalText: i.originalText || '',
          aiSummary: i.aiSummary || '',
        })),
        userInput: params.userInput,
        presetId: params.presetId || '',
        style: params.style || '',
        ratio: params.ratio || '',
        paletteName: params.paletteName || '',
      });
      if (res.success && res.data?.prompt) {
        setRefinedPrompt(res.data.prompt);
        return res.data.prompt;
      }
      return '';
    } catch (e: any) {
      setError(e.message || '提炼失败');
      throw e;
    } finally {
      setRefining(false);
    }
  }, []);

  const generate = useCallback(async (params: ImageGenParams): Promise<ImageGenResult> => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ imageUrl?: string; url?: string } | Array<{ imageUrl: string }>>('/ai/image', {
        prompt: params.prompt,
        ratio: params.ratio || '1:1',
        n: params.n ?? 1,
        presetId: params.presetId || '',
        style: params.style || '',
        paletteId: params.paletteId || '',
        seed: params.seed || undefined,
        negativePrompt: params.negativePrompt || undefined,
      });
      if (!res.success) throw new Error(res.error || '生成失败');
      const data = res.data;
      if (Array.isArray(data)) {
        const batchImages = data.map((r: any) => r.imageUrl).filter(Boolean);
        return { imageUrl: batchImages[0], batchImages };
      }
      return { imageUrl: (data as any)?.imageUrl || (data as any)?.url };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { refinePrompt, generate, refining, generating, refinedPrompt, error, setError };
}
