'use client';

// Agent 聊天主容器 — 流式消息列表 + 输入框 + 模式切换

import { useState, useRef, useEffect, useCallback } from 'react';
import { AgentMessage } from './AgentMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import type { AgentEvent } from '@/lib/agent/types';

interface UIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallRecord[];
  timestamp: Date;
}

interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; error?: string };
}

export function AgentChatView() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<'conversational' | 'agent'>('conversational');
  const [statusText, setStatusText] = useState('');
  const [currentTool, setCurrentTool] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseClientRef = useRef<AgentSSEClient | null>(null);
  const assistantMsgRef = useRef<string>('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: trimmed,
      toolCalls: [],
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: UIMessage = {
      id: assistantId,
      type: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    setStatusText('');
    setCurrentTool('');
    assistantMsgRef.current = '';

    const client = new AgentSSEClient();
    sseClientRef.current = client;

    try {
      for await (const event of client.stream('/api/ai/agent/chat', {
        content: trimmed,
        conversational: mode === 'conversational',
      })) {
        switch (event.type) {
          case 'thinking':
            setStatusText(event.message);
            break;

          case 'tool_call':
            setCurrentTool(event.tool);
            setStatusText('executing');
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return {
                  ...m,
                  toolCalls: [
                    ...m.toolCalls,
                    { tool: event.tool, params: event.params },
                  ],
                };
              })
            );
            break;

          case 'tool_result': {
            setCurrentTool('');
            setStatusText('');
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const toolCalls = [...m.toolCalls];
                const last = toolCalls[toolCalls.length - 1];
                if (last && last.tool === event.tool) {
                  last.result = event.result;
                }
                return { ...m, toolCalls };
              })
            );
            break;
          }

          case 'delta':
            assistantMsgRef.current += event.content;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return { ...m, content: assistantMsgRef.current };
              })
            );
            break;

          case 'done':
            if (event.response && !assistantMsgRef.current) {
              assistantMsgRef.current = event.response;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  return { ...m, content: event.response };
                })
              );
            }
            setStatusText('');
            setCurrentTool('');
            break;

          case 'error':
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return { ...m, content: `出错了: ${event.message}` };
              })
            );
            setStatusText('');
            setCurrentTool('');
            break;
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户取消
      } else {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            return { ...m, content: `网络错误: ${e instanceof Error ? e.message : String(e)}` };
          })
        );
      }
    } finally {
      setIsStreaming(false);
      sseClientRef.current = null;
    }
  }, [input, isStreaming, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAbort = () => {
    sseClientRef.current?.abort();
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-col h-full max-w-[448px] mx-auto">
      {/* 顶部：模式切换 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h1 className="text-lg font-semibold text-white">对话助手</h1>
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setMode('conversational')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'conversational'
                ? 'bg-blue-500 text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            对话模式
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              mode === 'agent'
                ? 'bg-blue-500 text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            进阶模式
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-white/30 px-8 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-sm mb-2">
              {mode === 'conversational'
                ? '跟我说说你想创作什么吧'
                : '我是你的 AI 助手，可以搜索、生图、查天气'}
            </p>
            <p className="text-xs">
              {mode === 'conversational'
                ? '我会一步步引导你完成创作'
                : '我会自动调用工具来完成复杂任务'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <AgentMessage
            key={msg.id}
            type={msg.type}
            content={msg.content}
            toolCalls={msg.toolCalls.length > 0 ? msg.toolCalls : undefined}
            timestamp={msg.timestamp}
          />
        ))}

        {/* 思考指示器 */}
        {isStreaming && (statusText === 'executing' || statusText === 'thinking' || statusText) && (
          <ThinkingIndicator
            status={statusText === 'executing' ? 'executing' : 'thinking'}
            toolName={currentTool}
            message={statusText === 'executing' || statusText === 'thinking' ? undefined : statusText}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-end gap-2 bg-white/5 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'conversational'
                ? '说说你想创作什么...'
                : '输入任何问题，我会自动调用工具...'
            }
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none max-h-[120px] py-1"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white disabled:opacity-30 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
        {mode === 'agent' && (
          <p className="text-xs text-white/20 text-center mt-2">
            Agent 模式会自动搜索、生图、查天气等
          </p>
        )}
      </div>
    </div>
  );
}
