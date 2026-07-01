'use client';

// Agent 会话列表下拉 — 历史会话、新建、置顶、重命名、删除

import type { AgentSession } from '@/hooks/use-agent-sessions';

interface AgentSessionListProps {
  sessions: AgentSession[];
  currentSessionId: string | null;
  editingTitle: string | null;
  editTitleValue: string;
  isLoading: boolean;
  setEditTitleValue: (val: string) => void;
  setEditingTitle: (id: string | null) => void;
  onSwitchSession: (session: AgentSession) => void;
  onNewSession: () => void;
  onDeleteSession: (e: React.MouseEvent, sessionId: string) => void;
  onTogglePin: (e: React.MouseEvent, sessionId: string) => void;
  onStartEditTitle: (sessionId: string, title: string) => void;
  onSaveEditTitle: () => void;
  onClose: () => void;
}

export function AgentSessionList({
  sessions, currentSessionId, editingTitle, editTitleValue,
  isLoading, setEditTitleValue, setEditingTitle,
  onSwitchSession, onNewSession, onDeleteSession, onTogglePin,
  onStartEditTitle, onSaveEditTitle, onClose,
}: AgentSessionListProps) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
        <div className="p-2 border-b border-gray-700">
          <button
            onClick={onNewSession}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
            </svg>
            新对话
          </button>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">暂无历史对话</div>
        ) : [...sessions].sort((a, b) => {
          const aPinned = (a.metadata as any)?.pinned ? 1 : 0;
          const bPinned = (b.metadata as any)?.pinned ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }).map(s => (
          <div
            key={s.id}
            onClick={() => { if (editingTitle !== s.id) onSwitchSession(s); }}
            className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-700/50 text-sm ${s.id === currentSessionId ? 'bg-gray-700/30 text-white' : 'text-gray-400'}`}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {editingTitle === s.id ? (
              <input
                autoFocus
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEditTitle();
                  if (e.key === 'Escape') setEditingTitle(null);
                }}
                onBlur={() => setTimeout(onSaveEditTitle, 150)}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-600 text-white text-sm rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
              />
            ) : (
              <span
                className="truncate flex-1"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onStartEditTitle(s.id, s.title);
                }}
                title="双击修改名称"
              >{s.title}</span>
            )}
            {/* 置顶 */}
            <button
              onClick={(e) => onTogglePin(e, s.id)}
              className={`w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0 transition-opacity ${(s.metadata as any)?.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              title={(s.metadata as any)?.pinned ? '取消置顶' : '置顶'}
            >
              <svg className={`w-3 h-3 ${(s.metadata as any)?.pinned ? 'text-amber-400' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            </button>
            {editingTitle !== s.id && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStartEditTitle(s.id, s.title);
                }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="修改名称"
              >
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => onDeleteSession(e, s.id)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
