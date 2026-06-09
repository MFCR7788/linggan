'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MemoryEntry, MemorySearchResult } from '@/lib/assistant/types';

// ====== 记忆列表 ======

export interface MemoryQuery {
  category?: string;
  query?: string;
}

export function useMemories(params?: MemoryQuery) {
  const { category, query } = params || {};

  return useQuery({
    queryKey: ['memories', { category, query }],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (query) {
        searchParams.set('action', 'search');
        searchParams.set('query', query);
      } else if (category) {
        searchParams.set('category', category);
      }
      const qs = searchParams.toString();
      const resp = await apiClient.get<(MemoryEntry | MemorySearchResult)[]>(
        `/assistant/memory${qs ? '?' + qs : ''}`
      );
      if (!resp.success) throw new Error(resp.error);
      return resp.data ?? [];
    },
  });
}

// ====== 删除记忆 ======

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const resp = await apiClient.delete(`/assistant/memory?id=${id}`);
      if (!resp.success) throw new Error(resp.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}
