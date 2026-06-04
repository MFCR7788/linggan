'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { WorkflowSession, WorkflowSessionStatus } from '@/types';
import type { RecommendationCombo } from '@/lib/account-presets';

// ─── 单个会话 ────────────────────────────────────────────

export function useWorkflowSession(sessionId?: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: session,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workflow-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await apiClient.get<WorkflowSession>(`/workflow/sessions/${sessionId}`);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: !!sessionId,
  });

  const isInWorkflow = !!(sessionId && session && session.status === 'active');

  // ─── Mutations ───────────────────────────────────────

  const createSessionMutation = useMutation({
    mutationFn: async (params: { combo: RecommendationCombo; accountType?: string; title?: string }) => {
      const res = await apiClient.post<{ session: WorkflowSession; firstStepUrl: string }>(
        '/workflow/sessions',
        {
          combo_id: params.combo.id,
          account_type: params.accountType,
          title: params.title,
          combo_snapshot: params.combo,
        }
      );
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
      router.push(data!.firstStepUrl);
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: async (params: {
      handoffData?: Record<string, string>;
      outputContentId?: string;
    }) => {
      if (!sessionId) throw new Error('No session');
      const res = await apiClient.patch<{
        session: WorkflowSession;
        nextStepUrl: string | null;
        isComplete: boolean;
      }>(`/workflow/sessions/${sessionId}/step-complete`, {
        handoffData: params.handoffData,
        outputContentId: params.outputContentId,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
      if (data!.nextStepUrl) {
        router.push(data!.nextStepUrl);
      }
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async (updates: {
      status?: WorkflowSessionStatus;
      current_step_index?: number;
      title?: string;
    }) => {
      if (!sessionId) throw new Error('No session');
      const res = await apiClient.patch<WorkflowSession>(`/workflow/sessions/${sessionId}`, updates);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
    },
  });

  const createSession = useCallback(
    async (combo: RecommendationCombo, options?: { accountType?: string; title?: string }) => {
      return createSessionMutation.mutateAsync({
        combo,
        accountType: options?.accountType,
        title: options?.title,
      });
    },
    [createSessionMutation]
  );

  const completeCurrentStep = useCallback(
    async (handoffData?: Record<string, string>, outputContentId?: string) => {
      return completeStepMutation.mutateAsync({ handoffData, outputContentId });
    },
    [completeStepMutation]
  );

  const pauseSession = useCallback(async () => {
    return updateSessionMutation.mutateAsync({ status: 'paused' as WorkflowSessionStatus });
  }, [updateSessionMutation]);

  const resumeSession = useCallback(async () => {
    return updateSessionMutation.mutateAsync({ status: 'active' as WorkflowSessionStatus });
  }, [updateSessionMutation]);

  const abandonSession = useCallback(async () => {
    return updateSessionMutation.mutateAsync({ status: 'abandoned' as WorkflowSessionStatus });
  }, [updateSessionMutation]);

  return {
    session,
    isLoading,
    error,
    isInWorkflow,
    createSession,
    completeCurrentStep,
    pauseSession,
    resumeSession,
    abandonSession,
    isCompleting: completeStepMutation.isPending,
    isCreating: createSessionMutation.isPending,
  };
}

// ─── 会话列表 ────────────────────────────────────────────

export function useWorkflowSessions(params?: { status?: WorkflowSessionStatus; limit?: number }) {
  const { status, limit = 10 } = params || {};

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(limit));
  if (status) queryParams.set('status', status);

  return useQuery({
    queryKey: ['workflow-sessions', status, limit],
    queryFn: async () => {
      const res = await apiClient.get<WorkflowSession[]>(
        `/workflow/sessions?${queryParams.toString()}`
      );
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
  });
}
