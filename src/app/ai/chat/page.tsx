'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, Plus, Trash2, MessageSquare, Sparkles,
  ChevronRight, Brain, Search, Globe, Cpu,
  Hash, Lightbulb, PanelLeftClose, PanelLeft, Puzzle,
} from 'lucide-react';
import { ProtectedRoute } from '@/components';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { GlassCard } from '@/components/GlassCard';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import {
  useChatSessions, useChatSession, useCreateSession,
  useDeleteSession, useSendMessage,
  type ChatMessage,
} from '@/hooks/use-chat';
import { useSkills } from '@/hooks/use-skills';

// ====== 模型选项 ======
const MODELS = [
  { value: 'auto', label: '自动', desc: 'DeepSeek → 豆包' },
  { value: 'deepseek', label: 'DeepSeek', desc: '文本推理' },
  { value: 'doubao', label: '豆包', desc: '多模态' },
  { value: 'qwen-plus', label: '千问 Plus', desc: '通用' },
  { value: 'qwen-max', label: '千问 Max', desc: '复杂任务' },
];

// ====== 意图颜色 ======
const INTENT_COLORS: Record<string, string> = {
  writing: '#F59E0B',
  knowledge: '#3B82F6',
  life: '#22C55E',
  schedule: '#8B5CF6',
  office: '#06B6D4',
  image: '#EC4899',
  video: '#EF4444',
  coding: '#6366F1',
  creative: '#F472B6',
  legal: '#F97316',
  weather: '#67E8F9',
};

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return '刚刚';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ====== 上下文统计徽章 ======
function ContextBadge({ context }: { context: ChatResponse['_context'] }) {
  if (!context) return null;
  const parts: { icon: React.ReactNode; label: string }[] = [];
  if (context.memoriesUsed > 0) parts.push({ icon: <Brain size={10} />, label: `记忆` });
  if (context.inspirationsUsed > 0) parts.push({ icon: <Lightbulb size={10} />, label: `${context.inspirationsUsed}` });
  if (context.knowledgeUsed > 0) parts.push({ icon: <Search size={10} />, label: `${context.knowledgeUsed}` });
  if (context.webSearchUsed) parts.push({ icon: <Globe size={10} />, label: '联网' });
  if (!parts.length) return null;

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {parts.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px]"
          style={{ background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          {p.icon}{p.label}
        </span>
      ))}
    </div>
  );
}

import type { ChatResponse } from '@/hooks/use-chat';

function ChatContent() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('auto');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  // 本地消息（渲染用，包含未保存的最新消息）
  const [localMessages, setLocalMessages] = useState<Array<{
    type: 'user' | 'ai';
    content: string;
    tags?: string[];
    suggestions?: string[];
    intent?: string;
    _context?: ChatResponse['_context'];
    _model?: string;
    timestamp: string;
  }>>([]);

  // 斜杠指令自动补全
  const OFFICIAL_COMMANDS = [
    { command: '/xiaohongshu', label: '小红书文案优化', desc: '高互动率标题和正文', cat: 'writing' },
    { command: '/douyin', label: '抖音脚本创作', desc: '3秒钩子和口播脚本', cat: 'social' },
    { command: '/wechat', label: '公众号排版助手', desc: '排版和阅读体验优化', cat: 'writing' },
    { command: '/seo', label: 'SEO 标题生成', desc: '搜索友好标题策略', cat: 'writing' },
    { command: '/remix', label: '多平台改写', desc: '一稿多平台适配', cat: 'social' },
    { command: '/hotspot', label: '热点追踪分析', desc: '事件脉络和创作角度', cat: 'analysis' },
    { command: '/draw', label: 'AI 绘画提示词', desc: '5层 prompt 结构', cat: 'image' },
    { command: '/storyboard', label: '视频分镜脚本', desc: '分镜表和拍摄法则', cat: 'video' },
  ];
  const [slashMenu, setSlashMenu] = useState<{ show: boolean; filter: string; index: number; pos: number }>({
    show: false, filter: '', index: 0, pos: 0,
  });
  const { data: installedSkills } = useSkills({ action: 'installed' });

  // 合并可用指令：官方 + 用户已安装（去重）
  const availableCommands = useMemo(() => {
    const seen = new Set(OFFICIAL_COMMANDS.map(c => c.command));
    const list = [...OFFICIAL_COMMANDS];
    if (installedSkills) {
      for (const s of installedSkills) {
        const cmd = `/${s.name}`;
        if (!seen.has(cmd)) {
          seen.add(cmd);
          list.push({ command: cmd, label: s.displayName, desc: s.description?.slice(0, 20) || '', cat: s.category || '' });
        }
      }
    }
    return list;
  }, [installedSkills]);

  // 过滤匹配的指令
  const filteredCommands = useMemo(() => {
    if (!slashMenu.show) return [];
    const f = slashMenu.filter.toLowerCase();
    if (!f) return availableCommands;
    return availableCommands.filter(c =>
      c.command.toLowerCase().includes(f) ||
      c.label.toLowerCase().includes(f)
    );
  }, [availableCommands, slashMenu]);

  const { data: sessions, isLoading: sessionsLoading } = useChatSessions();
  const { data: sessionDetail, isLoading: msgsLoading } = useChatSession(activeSessionId ?? undefined);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const sendMessage = useSendMessage();

  // 切换到会话时加载历史消息
  useEffect(() => {
    if (sessionDetail?.messages) {
      setLocalMessages(
        sessionDetail.messages.map((m: ChatMessage) => ({
          type: m.type,
          content: m.content,
          timestamp: m.created_at,
        }))
      );
    } else if (!activeSessionId) {
      setLocalMessages([]);
    }
  }, [sessionDetail, activeSessionId]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, sendMessage.isPending]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sendMessage.isPending) return;

    setInput('');

    // 添加用户消息
    const userMsg = { type: 'user' as const, content, timestamp: new Date().toISOString() };
    setLocalMessages(prev => [...prev, userMsg]);

    try {
      const result = await sendMessage.mutateAsync({
        content,
        session_id: activeSessionId ?? undefined,
        model: model === 'auto' ? undefined : model,
      });

      // 添加 AI 回复
      setLocalMessages(prev => [...prev, {
        type: 'ai',
        content: result.response || '已收到',
        tags: result.tags,
        suggestions: result.suggestions,
        intent: result.intent,
        _context: result._context,
        _model: result._model,
        timestamp: new Date().toISOString(),
      }]);

      // 首次发送时创建会话
      if (!activeSessionId) {
        const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
        const newSession = await createSession.mutateAsync(title);
        setActiveSessionId(newSession.id);
        // 保存消息到新会话
        try {
          const { apiClient } = await import('@/lib/api-client');
          await apiClient.post('/chat/history', {
            action: 'save_messages',
            session_id: newSession.id,
            messages: [
              { type: 'user', content, content_type: 'text', attachments: [], metadata: {} },
              { type: 'ai', content: result.response || '', content_type: 'text', attachments: [], metadata: { intent: result.intent, tags: result.tags } },
            ],
          });
        } catch { /* 保存失败不影响体验 */ }
      } else {
        // 追加消息到现有会话
        try {
          const { apiClient } = await import('@/lib/api-client');
          await apiClient.post('/chat/history', {
            action: 'save_messages',
            session_id: activeSessionId,
            messages: [
              { type: 'user', content, content_type: 'text', attachments: [], metadata: {} },
              { type: 'ai', content: result.response || '', content_type: 'text', attachments: [], metadata: { intent: result.intent, tags: result.tags } },
            ],
          });
        } catch { /* 保存失败不影响体验 */ }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败';
      const code = (err as Record<string, unknown>)?.code as string | undefined;
      if (code === 'INSUFFICIENT_CREDITS') {
        setLocalMessages(prev => [...prev, {
          type: 'ai', content: '灵力不足，请先充值再使用 AI 合伙人功能。', timestamp: new Date().toISOString(),
        }]);
      } else {
        setLocalMessages(prev => [...prev, {
          type: 'ai', content: `抱歉，发送失败：${msg}`, timestamp: new Date().toISOString(),
        }]);
      }
    }
  }, [input, sendMessage, activeSessionId, model, createSession]);

  // 键盘发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 斜杠菜单导航
    if (slashMenu.show && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, index: Math.min(prev.index + 1, filteredCommands.length - 1) }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, index: Math.max(prev.index - 1, 0) }));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectSlashCommand(filteredCommands[slashMenu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 选中斜杠指令
  const selectSlashCommand = (cmd: typeof availableCommands[0]) => {
    const before = input.substring(0, slashMenu.pos);
    const after = input.substring(inputRef.current?.selectionStart || slashMenu.pos + 1);
    setInput(before + cmd.command + ' ' + after);
    setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // 新建会话
  const handleNewSession = () => {
    setActiveSessionId(null);
    setLocalMessages([]);
    setShowSidebar(false);
    setInput('');
    inputRef.current?.focus();
  };

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'profile': router.push('/profile'); break;
      default: router.push('/home'); break;
    }
  };

  const selectedModelLabel = MODELS.find(m => m.value === model)?.label || '自动';

  return (
    <div className="flex flex-col h-screen">
      <TopNav
        title="AI 合伙人"
        showBack
        onBack={() => router.push('/ai')}
        left={
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/5"
            title="会话列表"
          >
            {showSidebar ? <PanelLeftClose size={18} color="#9CA3AF" /> : <PanelLeft size={18} color="#9CA3AF" />}
          </button>
        }
        right={
          <div className="flex items-center gap-1">
            {/* 模型选择器 */}
            <div className="relative">
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}
              >
                <Cpu size={12} />
                {selectedModelLabel}
              </button>
              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-xl z-50 py-1"
                    style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}
                  >
                    {MODELS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => { setModel(m.value); setShowModelMenu(false); }}
                        className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center justify-between"
                      >
                        <span style={{ color: m.value === model ? '#93C5FD' : '#E5E7EB', fontSize: 13 }}>{m.label}</span>
                        <span style={{ color: '#6B7280', fontSize: 10 }}>{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleNewSession}
              className="p-1.5 rounded-lg hover:bg-white/5"
              title="新对话"
            >
              <Plus size={18} color="#E5E7EB" />
            </button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏 — 会话列表 */}
        {showSidebar && (
          <div
            className="absolute left-0 top-12 bottom-0 w-64 z-30 overflow-y-auto"
            style={{ background: 'rgba(10,22,41,0.98)', borderRight: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="p-3">
              <button
                onClick={handleNewSession}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm mb-2"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.25)' }}
              >
                <Plus size={14} /> 新对话
              </button>

              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : !sessions?.length ? (
                <p style={{ color: '#6B7280', fontSize: 12 }} className="text-center py-8">暂无对话记录</p>
              ) : (
                sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveSessionId(s.id); setShowSidebar(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left group hover:bg-white/5 transition-colors"
                    style={{ background: activeSessionId === s.id ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                  >
                    <MessageSquare size={14} color={activeSessionId === s.id ? '#93C5FD' : '#6B7280'} />
                    <span
                      className="flex-1 truncate text-sm"
                      style={{ color: activeSessionId === s.id ? '#E5E7EB' : '#9CA3AF' }}
                    >
                      {s.title || '新对话'}
                    </span>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{formatTime(s.updated_at)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定删除这个对话吗？')) {
                          deleteSession.mutate(s.id);
                          if (activeSessionId === s.id) handleNewSession();
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10"
                    >
                      <Trash2 size={12} color="#EF4444" />
                    </button>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* 主聊天区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {msgsLoading && activeSessionId ? (
              <div className="flex justify-center py-20">
                <LoadingSpinner text="加载对话..." />
              </div>
            ) : localMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState
                  icon={<Sparkles size={40} color="#3B82F6" />}
                  title="AI 合伙人"
                  description="你的专属 AI 创作伙伴，拥有记忆、知识和技能系统"
                />
              </div>
            ) : (
              localMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${msg.type === 'user' ? 'order-1' : ''}`}>
                    {/* 消息气泡 */}
                    <div
                      className="rounded-2xl px-4 py-2.5"
                      style={msg.type === 'user' ? {
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.4), rgba(139,92,246,0.3))',
                        border: '1px solid rgba(59,130,246,0.3)',
                        color: '#E5E7EB',
                        borderBottomRightRadius: 6,
                      } : {
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#E5E7EB',
                        borderBottomLeftRadius: 6,
                      }}
                    >
                      <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </p>
                    </div>

                    {/* AI 额外信息 */}
                    {msg.type === 'ai' && (
                      <div className="mt-1.5 px-1 space-y-1">
                        {/* 意图 + 模型 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {msg.intent && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px]"
                              style={{
                                background: `${INTENT_COLORS[msg.intent] || '#3B82F6'}15`,
                                color: INTENT_COLORS[msg.intent] || '#3B82F6',
                                border: `1px solid ${INTENT_COLORS[msg.intent] || '#3B82F6'}30`,
                              }}
                            >
                              <Hash size={9} />
                              {msg.intent === 'writing' ? '文案创作' :
                               msg.intent === 'knowledge' ? '知识问答' :
                               msg.intent === 'image' ? '图片生成' :
                               msg.intent === 'video' ? '视频生成' :
                               msg.intent === 'coding' ? '编程' :
                               msg.intent === 'creative' ? '创意策划' :
                               msg.intent}
                            </span>
                          )}
                          {msg._model && (
                            <span style={{ color: '#6B7280', fontSize: 10 }}>{msg._model}</span>
                          )}
                        </div>

                        {/* 上下文 */}
                        <ContextBadge context={msg._context ?? null} />

                        {/* 标签 */}
                        {msg.tags && msg.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {msg.tags.map((t, j) => (
                              <span
                                key={j}
                                className="px-1.5 py-0.5 rounded-md text-[10px]"
                                style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 创作建议 */}
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {msg.suggestions.map((s, j) => (
                              <button
                                key={j}
                                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                                className="px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 hover:bg-white/10 transition-colors"
                                style={{ background: 'rgba(59,130,246,0.08)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.15)' }}
                              >
                                <ChevronRight size={10} /> {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* AI 思考中 */}
            {sendMessage.isPending && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3 flex items-center gap-2"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderBottomLeftRadius: 6,
                  }}
                >
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span style={{ color: '#9CA3AF', fontSize: 12 }}>思考中...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div
            className="px-4 py-3 relative"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* 斜杠指令下拉 */}
            {slashMenu.show && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden z-50 max-h-[260px] overflow-y-auto"
                style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}
              >
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p style={{ color: '#6B7280', fontSize: 12 }}>没有匹配的技能指令</p>
                  </div>
                ) : (
                  filteredCommands.map((cmd, i) => (
                    <button
                      key={cmd.command}
                      onClick={() => selectSlashCommand(cmd)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                      style={{ background: i === slashMenu.index ? 'rgba(59,130,246,0.1)' : 'transparent' }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59,130,246,0.15)' }}
                      >
                        <Puzzle size={14} color="#93C5FD" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>{cmd.command}</p>
                        <p style={{ color: '#6B7280', fontSize: 11 }} className="truncate">{cmd.label} — {cmd.desc}</p>
                      </div>
                      <span style={{ color: '#4B5563', fontSize: 9 }}>Tab</span>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  // 检测斜杠指令
                  const cursor = e.target.selectionStart || 0;
                  const textBefore = val.substring(0, cursor);
                  const slashMatch = textBefore.match(/(?:^|\s)\/(\S*)$/);
                  if (slashMatch) {
                    const slashPos = textBefore.lastIndexOf('/');
                    setSlashMenu({ show: true, filter: slashMatch[1], index: 0, pos: slashPos });
                  } else {
                    setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，输入 / 选择技能指令..."
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-xl resize-none outline-none text-sm"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#E5E7EB',
                  maxHeight: 120,
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sendMessage.isPending}
                className="p-2.5 rounded-xl flex-shrink-0 transition-opacity"
                style={{
                  background: input.trim() && !sendMessage.isPending
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  opacity: input.trim() && !sendMessage.isPending ? 1 : 0.4,
                }}
              >
                <Send size={18} color="#FFFFFF" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <ChatContent />
    </ProtectedRoute>
  );
}
