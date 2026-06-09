'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SkillDefinition } from '@/lib/assistant/types';

// ====== 技能列表（Hub / 已安装 / 分类） ======

export interface SkillsQuery {
  action?: 'list' | 'installed' | 'hub';
  category?: string;
  query?: string;
}

export function useSkills(params?: SkillsQuery) {
  const { action, category, query } = params || {};

  return useQuery({
    queryKey: ['skills', { action, category, query }],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (query) {
        searchParams.set('action', 'search');
        searchParams.set('query', query);
      } else if (action === 'installed') {
        searchParams.set('action', 'installed');
      } else if (action === 'hub') {
        searchParams.set('action', 'hub');
      } else if (category) {
        searchParams.set('category', category);
      }
      const qs = searchParams.toString();
      const resp = await apiClient.get<SkillDefinition[]>(
        `/assistant/skills${qs ? '?' + qs : ''}`
      );
      if (!resp.success) throw new Error(resp.error);
      return resp.data ?? [];
    },
  });
}

// ====== 单个技能详情 ======

export function useSkill(skillId?: string) {
  return useQuery({
    queryKey: ['skill', skillId],
    queryFn: async () => {
      const resp = await apiClient.get<SkillDefinition>(
        `/assistant/skills?action=view&skillId=${skillId}`
      );
      if (!resp.success) throw new Error(resp.error);
      return resp.data!;
    },
    enabled: !!skillId,
  });
}

// ====== 安装技能 ======

export function useInstallSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const resp = await apiClient.post<{ installed: boolean }>('/assistant/skills', {
        action: 'install',
        skillId,
      });
      if (!resp.success) throw new Error(resp.error);
      return resp.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

// ====== 卸载技能 ======

export function useUninstallSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const resp = await apiClient.post<{ uninstalled: boolean }>('/assistant/skills', {
        action: 'uninstall',
        skillId,
      });
      if (!resp.success) throw new Error(resp.error);
      return resp.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}
