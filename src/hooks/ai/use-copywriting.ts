'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface CopywritingInspiration {
  title: string;
  originalText?: string;
  aiSummary?: string;
}

export interface CopywritingParams {
  inspirations: CopywritingInspiration[];
  type: string;
  style?: string;
  industry?: string;
  userInstruction?: string;
  noAiTaste?: boolean;
  n?: number;
}

export interface RefineParams {
  inspirations: CopywritingInspiration[];
  userInput?: string;
}

export function useCopywriting() {
  const [generating, setGenerating] = useState(false);
  const [researching, setResearching] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: CopywritingParams): Promise<{ content: string | string[]; researchResults?: string }> => {
    setResearching(true);
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ content: string | string[]; researchResults?: string }>('/ai/copywriting', {
        inspirations: params.inspirations.map(i => ({
          title: i.title,
          originalText: i.originalText || i.title,
          aiSummary: i.aiSummary || '',
        })),
        type: params.type,
        style: params.style || '',
        noAiTaste: params.noAiTaste ?? false,
        n: params.n ?? 1,
        industry: params.industry || '',
        userInstruction: params.userInstruction || '',
      });
      if (!res.success) throw new Error(res.error || '生成失败');
      return { content: res.data!.content, researchResults: res.data!.researchResults };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setResearching(false);
      setGenerating(false);
    }
  }, []);

  const refine = useCallback(async (params: RefineParams): Promise<string> => {
    setRefining(true);
    setError(null);
    try {
      const res = await apiClient.post<{ refined: string }>('/ai/copywriting/refine', {
        inspirations: params.inspirations.map(i => ({
          title: i.title,
          originalText: i.originalText || '',
          aiSummary: i.aiSummary || '',
        })),
        userInput: params.userInput || '',
      });
      if (!res.success) throw new Error(res.error || '提炼失败');
      return res.data!.refined;
    } catch (e: any) {
      setError(e.message || '提炼失败');
      throw e;
    } finally {
      setRefining(false);
    }
  }, []);

  return { generate, refine, generating, researching, refining, error, setError };
}
