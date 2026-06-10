// Agent 会话管理 Hook — 复用 /api/chat/history
'use client';

import { useState, useCallback } from 'react';
import { syncDevAuthCookie } from '@/lib/dev-auth';

export interface AgentSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface AgentSessionMessage {
  id: string;
  type: string;
  content: string;
  content_type?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

export function useAgentSessions() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/chat/history');
      const data = await res.json();
      const list: AgentSession[] = data.data || [];
      setSessions(list);
      return list;
    } catch (e) {
      console.warn('加载会话列表失败:', e);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string): Promise<AgentSessionMessage[]> => {
    try {
      syncDevAuthCookie();
      const res = await fetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      return data.data?.messages || [];
    } catch (e) {
      console.warn('加载消息失败:', e);
      return [];
    }
  }, []);

  const createSession = useCallback(async (title?: string, metadata?: Record<string, unknown>): Promise<AgentSession | null> => {
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_session', title: title || '新对话', metadata: metadata || {} }),
      });
      const data = await res.json();
      const session = data.data as AgentSession;
      if (session) {
        setSessions(prev => [session, ...prev]);
        setCurrentSessionId(session.id);
      }
      return session;
    } catch (e) {
      console.error('创建会话失败:', e);
      return null;
    }
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setShowSessionList(false);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      syncDevAuthCookie();
      await fetch(`/api/chat/history?session_id=${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    } catch (e) {
      console.error('删除会话失败:', e);
    }
  }, [currentSessionId]);

  const updateTitle = useCallback(async (sessionId: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
    try {
      syncDevAuthCookie();
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_title', session_id: sessionId, title }),
      });
    } catch (e) {
      console.error('更新标题失败:', e);
    }
  }, []);

  const updateMetadata = useCallback(async (sessionId: string, metadata: Record<string, unknown>) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, metadata } : s));
    try {
      syncDevAuthCookie();
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_metadata', session_id: sessionId, metadata }),
      });
    } catch (e) {
      console.error('更新会话元数据失败:', e);
    }
  }, []);

  return {
    sessions, currentSessionId, setCurrentSessionId,
    showSessionList, setShowSessionList, isLoading,
    loadSessions, loadMessages, createSession,
    switchSession, deleteSession, updateTitle, updateMetadata,
  };
}
