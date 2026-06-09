'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ====== 类型 ======

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  type: 'user' | 'ai';
  content: string;
  content_type: string;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatSessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  summary: string;
  tags: string[];
  suggestions: string[];
  intent: string;
  generationRequest?: {
    type: string;
    prompt: string;
  };
  generatedImage?: { imageUrl: string; prompt: string; size: string };
  generatedVideo?: { taskId: string; status: string; prompt: string };
  sourceUrl?: string;
  sourcePlatform?: string;
  _model: string;
  _intent: string;
  _context: {
    memoriesUsed: number;
    inspirationsUsed: number;
    knowledgeUsed: number;
    webSearchUsed: boolean;
  } | null;
  _modelErrors?: string[];
  linkFetchFailed?: boolean;
}

export interface SendMessageInput {
  content: string;
  session_id?: string;
  model?: string;
  images?: string[];
  videos?: string[];
  documents?: string[];
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
}

// ====== 会话列表 ======

export function useChatSessions() {
  return useQuery({
    queryKey: ['chat-sessions'],
    queryFn: async () => {
      const resp = await apiClient.get<ChatSession[]>('/chat/history');
      if (!resp.success) throw new Error(resp.error);
      return resp.data ?? [];
    },
  });
}

// ====== 单个会话（含消息） ======

export function useChatSession(sessionId?: string) {
  return useQuery({
    queryKey: ['chat-session', sessionId],
    queryFn: async () => {
      const resp = await apiClient.get<ChatSessionDetail>(
        `/chat/history?session_id=${sessionId}`
      );
      if (!resp.success) throw new Error(resp.error);
      return resp.data;
    },
    enabled: !!sessionId,
  });
}

// ====== 创建会话 ======

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string) => {
      const resp = await apiClient.post<ChatSession>('/chat/history', {
        action: 'create_session',
        title: title || '新对话',
      });
      if (!resp.success) throw new Error(resp.error);
      return resp.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
  });
}

// ====== 删除会话 ======

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const resp = await apiClient.delete(`/chat/history?session_id=${sessionId}`);
      if (!resp.success) throw new Error(resp.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
  });
}

// ====== 发送消息 ======

export function useSendMessage() {
  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<ChatResponse> => {
      const resp = await apiClient.post<ChatResponse>('/ai/chat', input);
      if (!resp.success) {
        const err = Object.assign(
          new Error(resp.error || '请求失败'),
          { code: resp.code, data: resp.data }
        );
        throw err;
      }
      return resp.data!;
    },
  });
}
