"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Category, Tag } from "@/types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await apiClient.get<Category[]>("/categories");
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; icon?: string; color?: string }) => {
      const response = await apiClient.post<Category>("/categories", data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const response = await apiClient.get<Tag[]>("/tags");
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const response = await apiClient.post<Tag>("/tags", data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
