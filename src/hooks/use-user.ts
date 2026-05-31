"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { User } from "@/types";

// 开发模式：从 localStorage 获取用户信息
function getDevUserFromStorage(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("dev_user");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        id: parsed.id,
        phone: parsed.phone,
        username: parsed.username,
        avatar_url: undefined,
        plan: "free",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as User;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function useUser() {
  // 开发模式：优先从 localStorage 获取
  const devUser = getDevUserFromStorage();

  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      // 开发模式：如果 localStorage 有用户数据，直接返回
      if (devUser) {
        console.log("useUser: 开发模式，使用 localStorage 用户");
        return devUser;
      }

      try {
        const response = await apiClient.get<User>("/user");
        if (!response.success) {
          throw new Error(response.error);
        }
        return response.data;
      } catch (e) {
        console.warn("Failed to fetch user, returning null", e);
        return null;
      }
    },
    retry: false,
    // 开发模式：减少 staleTime 避免缓存问题
    staleTime: devUser ? 5 * 60 * 1000 : 0,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Partial<User>) => {
      const response = await apiClient.put<User>("/user", data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}
