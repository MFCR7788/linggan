'use client';

// Agent 消息气泡 — 显示文字 + 工具调用卡片

import { useState } from 'react';
import type { AgentEvent } from '@/lib/agent/types';

interface AgentMessageProps {
  type: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; params: Record<string, unknown>; result?: { success: boolean; output: string; error?: string } }>;
  timestamp?: Date;
}

export function AgentMessage({ type, content, toolCalls = [], timestamp }: AgentMessageProps) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const isUser = type === 'user';

  const toggleTool = (index: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 px-4`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-1'}`}>
        {/* 消息气泡 */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-white/10 text-white/90 rounded-bl-md'
          }`}
        >
          {content || (toolCalls.length > 0 && !content ? '正在处理...' : '')}
        </div>

        {/* 工具调用卡片 */}
        {toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {toolCalls.map((tc, i) => (
              <div key={i} className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                <button
                  onClick={() => toggleTool(i)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white/80 transition-colors"
                >
                  <span className={tc.result ? 'text-green-400' : 'text-yellow-400'}>
                    {tc.result ? '✓' : '◌'}
                  </span>
                  <span className="flex-1 text-left">
                    {TOOL_LABELS[tc.tool] || tc.tool}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform ${expandedTools.has(i) ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedTools.has(i) && tc.result && (
                  <div className="px-3 pb-2 text-xs text-white/50 border-t border-white/5 pt-2">
                    {tc.result.output}
                    {tc.result.error && (
                      <span className="text-red-400 block mt-1">错误: {tc.result.error}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 时间戳 */}
        {timestamp && (
          <div className={`text-xs text-white/30 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
            {timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  web_search: '搜索网络',
  generate_image: '生成图片',
  generate_video: '提交视频任务',
  get_weather: '查询天气',
  analyze_image: '分析图片',
  read_document: '读取文档',
  search_memory: '搜索记忆',
  search_knowledge: '搜索知识库',
  search_inspirations: '搜索灵感',
  get_hotspot: '获取热点',
  summarize: '总结内容',
  synthesize_speech: '语音合成',
};
