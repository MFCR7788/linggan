'use client';

// Agent 消息气泡 — 格式化文字 + 工具调用卡片 + 生成媒体预览 + 操作按钮

import { useState } from 'react';
import FormattedText from '@/components/FormattedText';

interface AgentMessageProps {
  type: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; params: Record<string, unknown>; result?: { success: boolean; output: string; data?: unknown; error?: string } }>;
  attachments?: Array<{ url: string; name: string; type: 'image' | 'video' | 'document' }>;
  generatedImages?: string[];
  generatedVideo?: { taskId: string; status: string; videoUrl?: string };
  generatedAudio?: string;
  schedules?: Array<{ title: string; scheduled_at: string; description?: string; location?: string; suggestions?: string[] }>;
  scheduledItems?: Set<string>;
  schedulingId?: string | null;
  onAddSchedule?: (index: number, edited?: { title: string; scheduled_at: string; description?: string; location?: string }) => void;
  onAddAllSchedules?: () => void;
  messageId?: string;
  timestamp?: Date;
  // 操作按钮
  onCopy?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onSaveToInspiration?: () => void;
  onSpeak?: () => void;
  onShare?: () => void;
  isCopied?: boolean;
  isRegenerating?: boolean;
}

export function AgentMessage({
  type, content, toolCalls = [], attachments,
  generatedImages, generatedVideo, generatedAudio,
  schedules, scheduledItems, schedulingId, onAddSchedule, onAddAllSchedules, messageId,
  timestamp,
  onCopy, onRegenerate, onDelete, onSaveToInspiration, onSpeak, onShare, isCopied, isRegenerating,
}: AgentMessageProps) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<{ index: number; title: string; scheduled_at: string; description: string; location: string } | null>(null);
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
    <div className="group relative mb-4 px-4">
      <div>
        {/* 附件预览（用户上传的图片/文档） */}
        {isUser && attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="overflow-hidden rounded-lg">
                {att.type === 'image' ? (
                  <img src={att.url} alt={att.name} className="w-20 h-20 object-cover rounded-lg border border-white/10 cursor-pointer hover:opacity-80 transition-opacity" loading="lazy" onClick={() => setLightboxSrc(att.url)} />
                ) : att.type === 'video' ? (
                  <div className="w-20 h-20 rounded-lg border border-white/10 bg-purple-500/10 flex flex-col items-center justify-center gap-1">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[9px] text-gray-400">{att.name.length > 6 ? att.name.slice(0, 6) + '..' : att.name}</span>
                  </div>
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

        {/* 消息气泡 — AI 消息使用 FormattedText */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-white/10 text-white/90 rounded-bl-md'
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{content || ''}</span>
          ) : (
            content ? <FormattedText text={content} color="#E5E7EB" fontSize={14} compact /> : (toolCalls.length > 0 ? <span className="text-white/50">正在处理...</span> : null)
          )}
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

        {/* 日程卡片 */}
        {!isUser && schedules && schedules.length > 0 && (
          <div className="mt-2">
            {schedules.length > 1 && (
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#A78BFA' }}>
                识别到 {schedules.length} 条日程
              </p>
            )}
            <div className="space-y-2">
              {schedules.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-xl p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))',
                    border: '1px solid rgba(139,92,246,0.25)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ fontSize: 14 }}>📅</span>
                    <span style={{ color: '#C4B5FD', fontSize: 12, fontWeight: 600 }}>
                      {formatScheduleTime(s.scheduled_at)}
                    </span>
                    <span style={{
                      color: (() => {
                        try { return new Date(s.scheduled_at) < new Date() ? '#EF4444' : '#10B981'; }
                        catch { return '#9CA3AF'; }
                      })(),
                      fontSize: 10,
                    }}>
                      {(() => {
                        try {
                          const d = new Date(s.scheduled_at);
                          const now = new Date();
                          if (d.toDateString() === now.toDateString()) return '(今天)';
                          if (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === d.toDateString()) return '(明天)';
                          return '';
                        } catch { return ''; }
                      })()}
                    </span>
                  </div>
                  <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                    {s.title}
                  </p>
                  {s.description && (
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 2, lineHeight: 1.4 }}>
                      {s.description}
                    </p>
                  )}
                  {s.location && (
                    <p style={{ color: '#6EE7B7', fontSize: 11 }}>
                      📍 {s.location}
                    </p>
                  )}
                  {s.suggestions && s.suggestions.length > 0 && (
                    <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                      {s.suggestions.map((si, i) => (
                        <p key={i} style={{ color: '#A78BFA', fontSize: 10, lineHeight: 1.5 }}>
                          {i + 1}. {si}
                        </p>
                      ))}
                    </div>
                  )}
                  {onAddSchedule && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const d = new Date(s.scheduled_at);
                        const localDT = isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 16);
                        setEditingSchedule({
                          index: idx,
                          title: s.title || '',
                          scheduled_at: localDT,
                          description: s.description || '',
                          location: s.location || '',
                        });
                      }}
                      disabled={scheduledItems?.has(`${messageId}-${idx}`) || schedulingId !== null}
                      className="mt-2 w-full py-1.5 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: scheduledItems?.has(`${messageId}-${idx}`) ? 'rgba(16,185,129,0.5)' : 'rgba(139,92,246,0.4)' }}
                    >
                      {scheduledItems?.has(`${messageId}-${idx}`) ? (
                        <>✅ 已添加</>
                      ) : (
                        <>📅 添加到日程</>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {schedules.length > 1 && onAddAllSchedules && (() => {
              const allCount = schedules.length;
              const addedCount = schedules.filter((_, i) => scheduledItems?.has(`${messageId}-${i}`)).length;
              const remaining = allCount - addedCount;
              const allDone = remaining === 0 && !schedulingId;
              return (
                <button
                  onClick={onAddAllSchedules}
                  disabled={allDone || schedulingId !== null}
                  className="mt-2 w-full py-1.5 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: allDone ? 'rgba(16,185,129,0.5)' : 'rgba(139,92,246,0.4)' }}
                >
                  {allDone ? (
                    <>✅ 已全部添加</>
                  ) : (
                    <>📅 添加全部日程 ({remaining}/{allCount}条)</>
                  )}
                </button>
              );
            })()}
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

        {/* 操作按钮 — AI 消息始终可见 */}
        {!isUser && onCopy && (
          <div className="flex items-center gap-0.5 mt-1.5 opacity-70 hover:opacity-100 transition-opacity duration-150">
            <ActionBtn
              icon={isCopied ? CheckIcon : CopyIcon}
              tooltip="复制"
              onClick={onCopy}
            />
            {onSpeak && (
              <ActionBtn
                icon={VolumeIcon}
                tooltip="语音播报"
                onClick={onSpeak}
              />
            )}
            {onShare && (
              <ActionBtn
                icon={ShareIcon}
                tooltip="分享"
                onClick={onShare}
              />
            )}
            <ActionBtn
              icon={RefreshIcon}
              tooltip="重新生成"
              className={isRegenerating ? 'animate-spin' : ''}
              onClick={onRegenerate || (() => {})}
            />
            {onSaveToInspiration && (
              <ActionBtn
                icon={isCopied ? CheckIcon : BookmarkIcon}
                tooltip="保存到灵感"
                onClick={onSaveToInspiration}
              />
            )}
            <ActionBtn
              icon={TrashIcon}
              tooltip="删除"
              onClick={onDelete || (() => {})}
            />
          </div>
        )}

        {isUser && onCopy && (
          <div className="flex items-center gap-0.5 mt-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <ActionBtn
              icon={isCopied ? CheckIcon : CopyIcon}
              tooltip="复制"
              onClick={onCopy}
            />
            <ActionBtn
              icon={TrashIcon}
              tooltip="删除"
              onClick={onDelete || (() => {})}
            />
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

      {/* 日程编辑弹窗 */}
      {editingSchedule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditingSchedule(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: 'rgba(30,41,59,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>编辑日程</h3>
              <button onClick={() => setEditingSchedule(null)} className="p-1 rounded-full hover:bg-white/10">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="日程标题"
                value={editingSchedule.title}
                onChange={e => setEditingSchedule(prev => prev ? { ...prev, title: e.target.value } : null)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-gray-200 outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <input
                type="datetime-local"
                value={editingSchedule.scheduled_at}
                onChange={e => setEditingSchedule(prev => prev ? { ...prev, scheduled_at: e.target.value } : null)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-gray-200 outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
              />
              <input
                type="text"
                placeholder="描述（可选）"
                value={editingSchedule.description}
                onChange={e => setEditingSchedule(prev => prev ? { ...prev, description: e.target.value } : null)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-gray-200 outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <input
                type="text"
                placeholder="地点（可选）"
                value={editingSchedule.location}
                onChange={e => setEditingSchedule(prev => prev ? { ...prev, location: e.target.value } : null)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-gray-200 outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditingSchedule(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!editingSchedule.title.trim() || !editingSchedule.scheduled_at) return;
                  const d = new Date(editingSchedule.scheduled_at);
                  const isoStr = d.toISOString();
                  onAddSchedule?.(editingSchedule.index, {
                    title: editingSchedule.title.trim(),
                    scheduled_at: isoStr,
                    description: editingSchedule.description.trim() || undefined,
                    location: editingSchedule.location.trim() || undefined,
                  });
                  setEditingSchedule(null);
                }}
                disabled={!editingSchedule.title.trim() || !editingSchedule.scheduled_at}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: !editingSchedule.title.trim() || !editingSchedule.scheduled_at
                    ? 'rgba(139,92,246,0.3)'
                    : 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                  color: '#FFFFFF',
                }}
              >
                保存日程
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== 日程时间格式化 ======

function formatScheduleTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === d.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dateLabel = isToday ? '今天' : isTomorrow ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
  return `${dateLabel} ${time}`;
}

// ====== 小图标按钮 ======

function ActionBtn({ icon: Icon, tooltip, onClick, className = '' }: {
  icon: React.ComponentType<{ size: number; color?: string }>;
  tooltip: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        className={`w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors ${className}`}
      >
        <Icon size={14} />
      </button>
      <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gray-700 text-gray-200 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-10">
        {tooltip}
      </span>
    </div>
  );
}

// ====== 内联图标组件（避免引入 lucide-react 依赖） ======

function CopyIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RefreshIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function BookmarkIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function VolumeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

function ShareIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function TrashIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
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
  extract_schedule: '提取日程',
  generate_copywriting: '生成文案',
  extract_links: '提取链接',
  save_inspiration: '保存灵感',
  generate_digital_human: '生成数字人',
  edit_image: '编辑图片',
  generate_grid_images: '生成组图',
  publish_content: '发布内容',
};
