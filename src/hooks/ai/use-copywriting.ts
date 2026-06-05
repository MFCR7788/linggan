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
  const [refining, setRefining] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: CopywritingParams): Promise<{ content: string | string[] }> => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ content: string | string[] }>('/ai/copywriting', {
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
      return { content: res.data!.content };
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
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

  const rewriteMulti = useCallback(async (content: string): Promise<Record<string, string>> => {
    setRewriting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ versions: Record<string, string> }>('/ai/copywriting/rewrite-multi', { content });
      if (!res.success) throw new Error(res.error || '多平台改写失败');
      return res.data!.versions || {};
    } catch (e: any) {
      setError(e.message || '多平台改写失败');
      throw e;
    } finally {
      setRewriting(false);
    }
  }, []);

  return { generate, refine, rewriteMulti, generating, refining, rewriting, error, setError };
}
