"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ContentItem, ContentType } from "@/types";

export function useInspiration(id?: string) {
  return useQuery({
    queryKey: ["inspiration", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<ContentItem>(`/inspiration/${id}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // 文档抽取/AI 总结中时，每 3 秒轮询
      const processing =
        data.extraction_status === 'pending' ||
        data.extraction_status === 'extracting' ||
        (!data.ai_summary && (data.analysis_status === 'pending' || data.analysis_status === 'processing'));
      return processing ? 3000 : false;
    },
  });
}

export function useInspirationActions() {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiClient.put<ContentItem>(`/inspiration/${id}`, { status });
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
      queryClient.invalidateQueries({ queryKey: ["inspiration", id] });
    },
  });

  return { updateStatus };
}

interface InspirationsQuery {
  page?: number;
  limit?: number;
  type?: ContentType;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: string;
  tagIds?: string;
  sourcePlatform?: string;
}

export function useInspirations(params?: InspirationsQuery) {
  const { page = 1, limit = 20, type, categoryId, startDate, endDate, sortBy, sortOrder, tagIds, sourcePlatform } = params || {};

  const queryString = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(type && { type }),
    ...(categoryId && { categoryId }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(sortBy && { sortBy }),
    ...(sortOrder && { sortOrder }),
    ...(tagIds && { tagIds }),
    ...(sourcePlatform && { sourcePlatform }),
  });

  return useQuery({
    queryKey: ["inspirations", { page, limit, type, categoryId, startDate, endDate, sortBy, sortOrder, tagIds, sourcePlatform }],
    queryFn: async () => {
      const response = await apiClient.get<ContentItem[]>(`/inspiration?${queryString}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
  });
}

export function useCreateInspiration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      type: ContentType;
      title?: string;
      original_text?: string;
      summary?: string;
      ai_summary?: string;
      category_id?: string;
      tags?: string[];
      source_url?: string;
      source_platform?: string;
      media_urls?: string[];
    }) => {
      const response = await apiClient.post<ContentItem>("/inspiration", data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
    },
  });
}

export function useUpdateInspiration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ContentItem> }) => {
      const response = await apiClient.put<ContentItem>(`/inspiration/${id}`, data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
      queryClient.invalidateQueries({ queryKey: ["inspiration", id] });
    },
  });
}

export function useDeleteInspiration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<ContentItem>(`/inspiration/${id}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
    },
  });
}

export function useBatchDeleteInspiration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>("/inspiration/batch-delete", { ids });
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
    },
  });
}

export function useTriggerExtract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<ContentItem>(`/inspiration/${id}/extract`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["inspirations"] });
      queryClient.invalidateQueries({ queryKey: ["inspiration", id] });
    },
  });
}
