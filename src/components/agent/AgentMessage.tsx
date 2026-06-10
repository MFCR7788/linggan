'use client';

// Agent 消息气泡 — 显示文字 + 工具调用卡片 + 生成媒体预览

import { useState } from 'react';

interface AgentMessageProps {
  type: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; params: Record<string, unknown>; result?: { success: boolean; output: string; data?: unknown; error?: string } }>;
  attachments?: Array<{ url: string; name: string; type: 'image' | 'video' | 'document' }>;
  generatedImages?: string[];
  generatedVideo?: { taskId: string; status: string; videoUrl?: string };
  generatedAudio?: string;
  timestamp?: Date;
}

export function AgentMessage({ type, content, toolCalls = [], attachments, generatedImages, generatedVideo, generatedAudio, timestamp }: AgentMessageProps) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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
        {/* 附件预览（用户上传的图片/文档） */}
        {isUser && attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {attachments.map((att, i) => (
              <div key={i} className="overflow-hidden rounded-lg">
                {att.type === 'image' ? (
                  <img src={att.url} alt={att.name} className="w-20 h-20 object-cover rounded-lg border border-white/10 cursor-pointer hover:opacity-80 transition-opacity" loading="lazy" onClick={() => setLightboxSrc(att.url)} />
                ) : (
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-blue-500/20 border border-blue-500/30 text-blue-200 hover:bg-blue-500/30 transition-colors">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate max-w-[120px]">{att.name}</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

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

        {/* 生成的图片 */}
        {generatedImages && generatedImages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {generatedImages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`生成图片 ${i + 1}`}
                loading="lazy"
                className="w-24 h-24 object-cover rounded-xl border border-white/10 cursor-pointer hover:opacity-80 hover:scale-105 transition-all bg-gray-900/50"
                onClick={() => setLightboxSrc(url)}
              />
            ))}
            <p className="w-full text-[10px] text-white/30 mt-0.5">点击图片查看大图</p>
          </div>
        )}

        {/* 生成的视频 */}
        {generatedVideo && (
          <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-white/5">
            {generatedVideo.videoUrl ? (
              <video src={generatedVideo.videoUrl} controls className="w-full rounded-xl bg-black" style={{ maxHeight: '50vh' }} />
            ) : (
              <div className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-sm text-white/80">
                      {generatedVideo.status === 'queued' ? '视频排队中...' : '视频生成中...'}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">任务 ID: {generatedVideo.taskId}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 生成的音频 */}
        {generatedAudio && (
          <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-xs text-white/50">语音合成</span>
            </div>
            <audio src={generatedAudio} controls className="w-full h-8" />
          </div>
        )}

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

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="max-w-[95vw] max-h-[95vh] object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
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
