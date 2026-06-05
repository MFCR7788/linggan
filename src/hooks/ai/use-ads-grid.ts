'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface GridCell {
  imageUrl: string;
  title: string;
  prompt?: string;
  visualAngle: string;
  sellingPointIndex: number;
}

export interface AdsGridParams {
  product: string;
  sellingPoints: string[];
  referenceImage?: string;
  context?: string;
}

export interface AdsGridResult {
  cells: GridCell[];
  successCount: number;
}

export function useAdsGrid() {
  const [generating, setGenerating] = useState(false);
  const [cells, setCells] = useState<GridCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: AdsGridParams): Promise<AdsGridResult> => {
    setGenerating(true);
    setError(null);
    setCells(null);
    try {
      const res = await apiClient.post<{ cells: GridCell[]; successCount: number }>('/ai/ads/grid', {
        product: params.product,
        sellingPoints: params.sellingPoints,
        referenceImage: params.referenceImage || undefined,
        context: params.context || '',
      });
      if (!res.success) throw new Error(res.error || '生成失败');
      const result = {
        cells: res.data!.cells || [],
        successCount: res.data!.successCount ?? (res.data!.cells || []).length,
      };
      setCells(result.cells);
      return result;
    } catch (e: any) {
      setError(e.message || '生成失败');
      throw e;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generate, generating, cells, error, setError };
}
