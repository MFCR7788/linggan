'use client';

// Agent 聊天主容器 — 会话管理 + 流式消息 + 语音 + 附件 + 媒体预览

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useInputHistory } from '@/hooks/use-input-history';
import { AgentMessage } from './AgentMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { useSkillRecommendations } from './SkillRecommendCards';
import { CapabilityTags } from './CapabilityTags';
import { ChoiceCards, type ChoiceSelection } from './ChoiceCards';
import { parseChoices, type ChoiceOption } from '@/lib/agent/choice-parser';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import { useVoiceRecording, formatTime } from '@/hooks/use-voice-recording';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useAgentSessions } from '@/hooks/use-agent-sessions';
import type { AttachedFile } from '@/hooks/use-file-upload';
import type { AgentSession } from '@/hooks/use-agent-sessions';
import { ACCOUNT_TYPE_PRESETS, type RecommendationCombo, type AccountTypePreset } from '@/lib/account-presets';

interface UIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallRecord[];
  attachments?: { url: string; name: string; type: 'image' | 'video' | 'document' }[];
  generatedImages?: string[];
  generatedVideo?: { taskId: string; status: string; videoUrl?: string };
  generatedAudio?: string;
  schedules?: ScheduleItem[];
  timestamp: Date;
}

interface ScheduleItem {
  title: string;
  scheduled_at: string;
  description?: string;
  location?: string;
  suggestions?: string[];
}

interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; data?: unknown; error?: string };
}

export function AgentChatView() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTool, setCurrentTool] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceSelections, setChoiceSelections] = useState<Map<number, ChoiceSelection>>(new Map());
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [scheduledItems, setScheduledItems] = useState<Set<string>>(new Set());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  // 账号类型选择 + 流程引导
  const [selectedAccountType, setSelectedAccountType] = useState<AccountTypePreset | null>(null);
  const [activeFlow, setActiveFlow] = useState<{ combo: RecommendationCombo; currentStep: number } | null>(null);
  const [accountSearch, setAccountSearch] = useState('');

  // 斜杠指令
  const [slashMenu, setSlashMenu] = useState<{ show: boolean; filter: string; index: number; pos: number }>({
    show: false, filter: '', index: 0, pos: 0,
  });

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

  const filteredCommands = (() => {
    if (!slashMenu.show) return [];
    const f = slashMenu.filter.toLowerCase();
    if (!f) return OFFICIAL_COMMANDS;
    return OFFICIAL_COMMANDS.filter(c =>
      c.command.toLowerCase().includes(f) || c.label.toLowerCase().includes(f)
    );
  })();

  const selectSlashCommand = (cmd: typeof OFFICIAL_COMMANDS[0]) => {
    const ta = inputRef.current;
    const cursorPos = ta?.selectionStart || slashMenu.pos + 1;
    const before = input.substring(0, slashMenu.pos);
    const after = input.substring(cursorPos);
    setInput(before + cmd.command + ' ' + after);
    setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
    setTimeout(() => ta?.focus(), 0);
    const newPos = slashMenu.pos + cmd.command.length + 1;
    setTimeout(() => {
      const ta = inputRef.current;
      if (ta) { ta.selectionStart = newPos; ta.selectionEnd = newPos; }
    }, 50);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseClientRef = useRef<AgentSSEClient | null>(null);
  const assistantMsgRef = useRef<string>('');
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressHandledRef = useRef(false);
  const sessionLoadedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPastingRef = useRef(false);

  // Intl.Segmenter — 安全设置光标位置（正确处理 emoji/CJK 字形簇）
  const setCursorSafe = useCallback((el: HTMLTextAreaElement, pos: number) => {
    try {
      const segmenter = new Intl.Segmenter('zh-Hans-CN', { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(el.value));
      // 将 grapheme 索引映射回 UTF-16 code unit 偏移
      if (pos >= segments.length) {
        el.selectionStart = el.selectionEnd = el.value.length;
      } else {
        el.selectionStart = el.selectionEnd = segments[pos]?.index ?? el.value.length;
      }
    } catch {
      el.selectionStart = el.selectionEnd = pos;
    }
  }, []);

  // 语音录制
  const voice = useVoiceRecording();
  const { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording } = voice;

  // 文件上传
  const fileUpload = useFileUpload();
  const { uploadError, setUploadError, uploadFile, pickImage, pickDocument, revokePreview } = fileUpload;

  // 输入历史（undo/redo 最多 50 步）
  const inputHistory = useInputHistory(input, setInput);

  // 技能推荐
  const skillRecs = useSkillRecommendations();

  // 会话管理
  const sessionMgr = useAgentSessions();
  const {
    sessions, currentSessionId,
    showSessionList, setShowSessionList, isLoading: isLoadingSessions,
    loadSessions, loadMessages, createSession,
    switchSession, deleteSession,
  } = sessionMgr;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动调整输入框高度
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // 加载会话列表
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    loadSessions().then(list => {
      if (list.length > 0) {
        switchSession(list[0].id);
        loadMessages(list[0].id).then(msgs => {
          const uiMsgs: UIMessage[] = msgs.map((m: any) => {
            const meta = m.metadata || {};
            return {
              id: m.id,
              type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content || '',
              toolCalls: Array.isArray(meta.toolCalls) ? meta.toolCalls : [],
              attachments: Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined,
              generatedImages: Array.isArray(meta.generatedImages) ? meta.generatedImages : undefined,
              generatedVideo: meta.generatedVideo || undefined,
              generatedAudio: meta.generatedAudio || undefined,
              schedules: Array.isArray(meta.schedules) ? meta.schedules : undefined,
              timestamp: new Date(m.created_at),
            };
          });
          setMessages(uiMsgs);
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doStream = useCallback(async (
    displayContent: string,
    uploadedImages: string[],
    uploadedVideos: string[],
    uploadedDocs: string[],
    attachmentInfo: { url: string; name: string; type: 'image' | 'video' | 'document' }[],
    sessionId: string | null,
  ) => {
    const assistantId = crypto.randomUUID();
    const assistantMsg: UIMessage = {
      id: assistantId,
      type: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(true);
    setStatusText('');
    setCurrentTool('');
    assistantMsgRef.current = '';

    const client = new AgentSSEClient();
    sseClientRef.current = client;

    try {
      for await (const event of client.stream('/api/ai/agent/chat', {
        content: displayContent,
        images: uploadedImages.length > 0 ? uploadedImages : undefined,
        documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
        session_id: sessionId || undefined,
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
                return { ...m, toolCalls: [...m.toolCalls, { tool: event.tool, params: event.params }] };
              })
            );
            break;

          case 'tool_result': {
            setCurrentTool('');
            setStatusText('');
            const resultData = event.result.data as Record<string, unknown> | undefined;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const toolCalls = [...m.toolCalls];
                const last = toolCalls[toolCalls.length - 1];
                if (last && last.tool === event.tool) last.result = event.result;

                let generatedImages = m.generatedImages;
                let generatedAudio = m.generatedAudio;
                let generatedVideo = m.generatedVideo;
                let schedules = m.schedules;

                if (resultData) {
                  if (event.tool === 'generate_image' && Array.isArray(resultData.imageUrls)) {
                    generatedImages = [...(m.generatedImages || []), ...resultData.imageUrls as string[]];
                  }
                  if (event.tool === 'synthesize_speech' && typeof resultData.audioBase64 === 'string') {
                    generatedAudio = `data:audio/mpeg;base64,${resultData.audioBase64}`;
                  }
                  if (event.tool === 'generate_video' && typeof resultData.taskId === 'string') {
                    generatedVideo = { taskId: resultData.taskId as string, status: (resultData.status as string) || 'queued' };
                  }
                  if (event.tool === 'extract_schedule' && Array.isArray(resultData.schedules)) {
                    schedules = resultData.schedules as ScheduleItem[];
                  }
                }

                return { ...m, toolCalls, generatedImages, generatedAudio, generatedVideo, schedules };
              })
            );
            break;
          }

          case 'delta':
            assistantMsgRef.current += event.content;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: assistantMsgRef.current } : m)
            );
            break;

          case 'done':
            if (event.response && !assistantMsgRef.current) {
              assistantMsgRef.current = event.response;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: event.response } : m)
              );
            }
            setStatusText('');
            setCurrentTool('');
            break;

          case 'error':
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: `出错了: ${event.message}` } : m)
            );
            setStatusText('');
            setCurrentTool('');
            break;

          case 'skills_matched':
            skillRecs.processEvent(event as any);
            break;
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { /* cancelled */ } else {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: `网络错误: ${e instanceof Error ? e.message : String(e)}` } : m)
        );
      }
    } finally {
      setIsStreaming(false);
      sseClientRef.current = null;
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    const hasFiles = attachedFiles.length > 0;
    if ((!trimmed && !hasFiles) || isStreaming) return;

    // 上传附件
    const uploadedImages: string[] = [];
    const uploadedVideos: string[] = [];
    const uploadedDocs: string[] = [];
    const attachmentInfo: { url: string; name: string; type: 'image' | 'video' | 'document' }[] = [];

    for (const af of attachedFiles) {
      const url = await uploadFile(af.file);
      if (url) {
        const type: 'image' | 'video' | 'document' = af.type;
        attachmentInfo.push({ url, name: af.file.name, type });
        if (type === 'image') uploadedImages.push(url);
        else if (type === 'video') uploadedVideos.push(url);
        else uploadedDocs.push(url);
      }
      if (af.type === 'image' || af.type === 'video') revokePreview(af.preview);
    }

    let displayContent = trimmed;
    if (!displayContent && uploadedDocs.length > 0) {
      displayContent = `请分析这份文档：${attachedFiles.filter(f => f.type === 'document').map(f => f.file.name).join('、')}`;
    }
    if (!displayContent && uploadedVideos.length > 0) {
      displayContent = `请分析这个视频`;
    }
    if (!displayContent && uploadedImages.length > 0) {
      displayContent = `请分析这${uploadedImages.length}张图片`;
    }

    // 如果没有当前会话，自动创建
    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = trimmed ? (trimmed.substring(0, 30) + (trimmed.length > 30 ? '...' : '')) : '新对话';
      const session = await createSession(title);
      if (session) sessionId = session.id;
    }

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: displayContent,
      toolCalls: [],
      attachments: attachmentInfo.length > 0 ? attachmentInfo : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFiles([]);

    await doStream(displayContent, uploadedImages, uploadedVideos, uploadedDocs, attachmentInfo, sessionId);
  }, [input, isStreaming, attachedFiles, currentSessionId, uploadFile, revokePreview, createSession, doStream]);

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

    const mod = e.metaKey || e.ctrlKey;

    // Undo: Ctrl+Z / Cmd+Z（无 Shift）
    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.undo();
      return;
    }

    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
    if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.redo();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAbort = () => {
    sseClientRef.current?.abort();
    setIsStreaming(false);
  };

  // 按住说话手势
  const handlePressStart = (e: React.PointerEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    pressHandledRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      if (pressHandledRef.current) return;
      pressHandledRef.current = true;
    }, 300);
    startRecording();
  };

  const handlePressEnd = async () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    if (pressHandledRef.current) return;
    pressHandledRef.current = true;
    const transcript = await stopRecording();
    if (transcript) setInput(prev => (prev ? prev + transcript : transcript));
  };

  // 附件操作
  const handlePickImage = async () => {
    setShowTools(false);
    const file = await pickImage();
    if (file) setAttachedFiles(prev => [...prev, file]);
  };

  const handlePickVideo = () => {
    setShowTools(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type)) return;
      if (file.size > 100 * 1024 * 1024) return;
      const preview = URL.createObjectURL(file);
      setAttachedFiles(prev => [...prev, { id: Date.now().toString(), file, preview, type: 'video' as const }]);
    };
    input.click();
  };

  const handlePickDocument = async () => {
    setShowTools(false);
    const file = await pickDocument();
    if (file) setAttachedFiles(prev => [...prev, file]);
  };

  const removeAttachedFile = (id: string) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.type === 'image' || file?.type === 'video') revokePreview(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  // 消息操作
  const handleCopy = useCallback((msg: UIMessage) => {
    const text = msg.content || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  }, []);

  const handleRegenerate = useCallback(async (msg: UIMessage) => {
    if (isStreaming) return;
    setRegeneratingId(msg.id);
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    let userMsg: UIMessage | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) { setRegeneratingId(null); return; }

    const images = userMsg.attachments?.filter(a => a.type === 'image').map(a => a.url) || [];
    const docs = userMsg.attachments?.filter(a => a.type === 'document').map(a => a.url) || [];
    const attachmentInfo = userMsg.attachments || [];

    setMessages(prev => prev.filter(m => m.id !== msg.id));
    await doStream(userMsg.content, images, [], docs, attachmentInfo, currentSessionId);
    setRegeneratingId(null);
  }, [isStreaming, messages, currentSessionId, doStream]);

  const handleDelete = useCallback((msg: UIMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  }, []);

  const handleSaveToInspiration = useCallback(async (msg: UIMessage) => {
    const text = msg.content;
    if (!text) return;
    try {
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/inspiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.substring(0, 50), content: text, type: 'text', tags: ['Agent生成'] }),
      });
      if (res.ok) {
        setCopiedId('saved_' + msg.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
    } catch { /* 静默失败 */ }
  }, []);

  const handleSpeak = useCallback(async (msg: UIMessage) => {
    const text = msg.content;
    if (!text) return;
    try {
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/ai/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'default' }),
      });
      const data = await res.json();
      if (data.success && data.data?.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.data.audioBase64}`);
        audio.play();
      }
    } catch { /* 静默失败 */ }
  }, []);

  const handleShare = useCallback(async (msg: UIMessage) => {
    const text = msg.content || '';
    if (navigator.share) {
      try {
        await navigator.share({ title: '灵集 AI 生成内容', text: text.substring(0, 200) });
      } catch { /* 用户取消 */ }
    } else {
      // 降级：复制内容
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId('shared_' + msg.id);
        setTimeout(() => setCopiedId(null), 1500);
      }).catch(() => {});
    }
  }, []);

  const addToSchedule = useCallback(async (msg: UIMessage, scheduleIndex?: number) => {
    const list = msg.schedules;
    if (!list || list.length === 0) return;
    const itemsToAdd = scheduleIndex !== undefined
      ? [list[scheduleIndex]]
      : list.filter((_, i) => !scheduledItems.has(`${msg.id}-${i}`));
    if (itemsToAdd.length === 0) return;
    setSchedulingId(msg.id);
    try {
      const baseUrl = window.location.origin;
      for (const s of itemsToAdd) {
        await fetch(`${baseUrl}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: s.title,
            description: s.description || undefined,
            scheduled_at: s.scheduled_at,
            location: s.location || undefined,
            color: '#8B5CF6',
            remind_before: 30,
            suggestions: s.suggestions?.length ? s.suggestions : undefined,
          }),
        });
      }
      setScheduledItems(prev => {
        const next = new Set(prev);
        if (scheduleIndex !== undefined) {
          next.add(`${msg.id}-${scheduleIndex}`);
        } else {
          list.forEach((_, i) => next.add(`${msg.id}-${i}`));
        }
        return next;
      });
      setTimeout(() => setSchedulingId(null), 2000);
    } catch {
      setSchedulingId(null);
    }
  }, [scheduledItems]);

  const handleChoiceSubmit = useCallback(async () => {
    if (isStreaming || choiceSubmitting) return;

    // 收集所有 block 的选择
    const parts: string[] = [];
    for (const sel of choiceSelections.values()) {
      for (const opt of sel.options) {
        parts.push(opt.label);
      }
      if (sel.customInput.trim()) {
        parts.push(sel.customInput.trim());
      }
    }
    if (parts.length === 0) return;

    setChoiceSubmitting(true);
    const labels = parts.join('、');
    const lastUserMsg = [...messages].reverse().find(m => m.type === 'user');
    const context = lastUserMsg?.content || '';
    const choiceText = `我的选择：${labels}${context ? `\n\n原始需求：${context}` : ''}`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: choiceText,
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setChoiceSelections(new Map());

    await doStream(choiceText, [], [], [], [], currentSessionId);
    setChoiceSubmitting(false);
  }, [isStreaming, choiceSubmitting, choiceSelections, messages, currentSessionId, doStream]);

  // 会话操作
  const handleSwitchSession = async (session: AgentSession) => {
    switchSession(session.id);
    setIsLoadingMessages(true);
    setMessages([]);
    setActiveFlow(null);
    setSelectedAccountType(null);
    const msgs = await loadMessages(session.id);
    const uiMsgs: UIMessage[] = msgs.map((m: any) => {
      const meta = m.metadata || {};
      return {
        id: m.id,
        type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content || '',
        toolCalls: Array.isArray(meta.toolCalls) ? meta.toolCalls : [],
        attachments: Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined,
        generatedImages: Array.isArray(meta.generatedImages) ? meta.generatedImages : undefined,
        generatedVideo: meta.generatedVideo || undefined,
        generatedAudio: meta.generatedAudio || undefined,
        schedules: Array.isArray(meta.schedules) ? meta.schedules : undefined,
        timestamp: new Date(m.created_at),
      };
    });
    setMessages(uiMsgs);
    setIsLoadingMessages(false);
  };

  const startEditTitle = (sessionId: string, currentTitle: string) => {
    setEditingTitle(sessionId);
    setEditTitleValue(currentTitle);
  };

  const saveEditTitle = async () => {
    if (editingTitle && editTitleValue.trim()) {
      await sessionMgr.updateTitle(editingTitle, editTitleValue.trim());
    }
    setEditingTitle(null);
  };

  const handleNewSession = () => {
    createSession();
    setMessages([]);
    setChoiceSelections(new Map());
    setSelectedAccountType(null);
    setActiveFlow(null);
    setAccountSearch('');
    setShowSessionList(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
    if (currentSessionId === sessionId) setMessages([]);
  };

  // 账号类型 → 组合推荐 → 流程引导
  const handleStartCombo = async (combo: RecommendationCombo) => {
    const session = await createSession(combo.title);
    if (!session) return;

    setActiveFlow({ combo, currentStep: 0 });
    setSelectedAccountType(null);
    setAccountSearch('');

    const stepsText = combo.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
    const kickoffMsg = `我要开始「${combo.emoji} ${combo.title}」创作流程。\n\n完整流程：\n${stepsText}\n\n请从第1步「${combo.steps[0].label}」开始引导我。先告诉我这个流程的整体目标，然后告诉我第1步需要准备什么。`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: kickoffMsg,
      toolCalls: [],
      timestamp: new Date(),
    };
    setMessages([userMsg]);

    await doStream(kickoffMsg, [], [], [], [], session.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 — 返回 + 会话选择器 + 新建 */}
      <div className="relative flex items-center px-4 py-3 border-b border-white/10">
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 会话选择器 — 居中 */}
        <div className="flex-1 flex justify-center items-center gap-2">
          <button
            onClick={() => setShowSessionList(!showSessionList)}
            className="flex items-center gap-1.5 max-w-[200px]"
          >
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {editingTitle === currentSessionId ? (
              <input
                autoFocus
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditTitle();
                  if (e.key === 'Escape') setEditingTitle(null);
                }}
                onBlur={saveEditTitle}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-700 text-white text-sm rounded px-1.5 py-0.5 outline-none max-w-[140px]"
              />
            ) : (
              <span
                className="truncate text-sm text-white"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const sid = currentSessionId;
                  const title = sessions.find(s => s.id === sid)?.title || '对话助手';
                  if (sid) startEditTitle(sid, title);
                }}
                title="双击修改名称"
              >
                {currentSessionId
                  ? sessions.find(s => s.id === currentSessionId)?.title || '对话助手'
                  : '对话助手'}
              </span>
            )}
            <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* 新建对话 */}
        <button
          onClick={handleNewSession}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title="新建对话"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
          </svg>
        </button>

        {/* 会话列表下拉 */}
        {showSessionList && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowSessionList(false)} />
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-72 overflow-y-auto">
              <div className="p-2 border-b border-gray-700">
                <button
                  onClick={handleNewSession}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                  </svg>
                  新对话
                </button>
              </div>
              {isLoadingSessions ? (
                <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">暂无历史对话</div>
              ) : sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => { if (editingTitle !== s.id) handleSwitchSession(s); }}
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
                        if (e.key === 'Enter') saveEditTitle();
                        if (e.key === 'Escape') setEditingTitle(null);
                      }}
                      onBlur={() => setTimeout(saveEditTitle, 150)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-gray-600 text-white text-sm rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                    />
                  ) : (
                    <span
                      className="truncate flex-1"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startEditTitle(s.id, s.title);
                      }}
                      title="双击修改名称"
                    >{s.title}</span>
                  )}
                  {editingTitle !== s.id && (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault(); // 防止按钮卸载时焦点丢失
                        e.stopPropagation();
                        startEditTitle(s.id, s.title);
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
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0"
                  >
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 消息列表 — pb-32 给固定输入框留空间 */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1 pb-32">
        {messages.length === 0 && !isLoadingSessions && !isLoadingMessages && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            {/* Logo */}
            <img
              src="/brand/logo-mark.png"
              alt="灵集"
              className="w-20 h-20 mb-5"
              style={{ filter: 'drop-shadow(0 0 24px rgba(139,92,246,0.5))' }}
            />

            {/* 欢迎语 */}
            <h2 className="text-lg font-semibold text-white mb-2">
              你好！我是灵集AI，你的智能创作助手
            </h2>

            {/* 能力标签 */}
            <p className="text-sm text-white/50 mb-1">
              AI 文案 · 生图 · 视频 · 配音 · 热点 · 知识问答
            </p>

            {/* 副标题 */}
            <p className="text-xs text-white mb-1">
              从灵感采集到内容创作，一站式帮你高效产出优质内容
            </p>

            {/* 引导语 */}
            <p className="text-lg text-blue-300 mb-6">
              今天你有什么灵感，发送给我！
            </p>

            {/* 账号类型选择 / 推荐组合 */}
            <div className="w-full max-w-sm">
              {!selectedAccountType ? (
                <>
                  {/* 搜索 */}
                  <div className="relative mb-3">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="搜索账号类型..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  {/* 账号类型网格 */}
                  <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {ACCOUNT_TYPE_PRESETS.filter(p =>
                      !accountSearch || p.label.includes(accountSearch) || p.desc.includes(accountSearch)
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedAccountType(preset)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                      >
                        <span className="text-2xl">{preset.emoji}</span>
                        <span className="text-sm font-medium text-white">{preset.label}</span>
                        <span className="text-[10px] text-gray-400 leading-tight text-center line-clamp-2">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* 选中账号类型 + 返回 */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => { setSelectedAccountType(null); setAccountSearch(''); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 flex-shrink-0"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-2xl">{selectedAccountType.emoji}</span>
                    <span className="text-sm font-semibold text-white">{selectedAccountType.label}</span>
                    <span className="text-[10px] text-gray-500">{selectedAccountType.audience}</span>
                  </div>
                  {/* 推荐组合列表 */}
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {selectedAccountType.combos.map((combo) => (
                      <button
                        key={combo.id}
                        onClick={() => handleStartCombo(combo)}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-lg">{combo.emoji}</span>
                          <span className="text-sm font-semibold text-white">{combo.title}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">{combo.desc}</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {combo.steps.map((step, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5">
                              {i > 0 && <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                                {step.label}
                              </span>
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 快捷能力标签 — 未选账号类型时显示 */}
            {!selectedAccountType && (
              <div className="mt-4 w-full max-w-sm">
                <CapabilityTags onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }} />
              </div>
            )}
          </div>
        )}

        {/* 流程引导头部 */}
        {activeFlow && messages.length > 0 && (
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-lg">{activeFlow.combo.emoji}</span>
              <span className="text-sm font-semibold text-white">{activeFlow.combo.title}</span>
              <button
                onClick={() => setActiveFlow(null)}
                className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded hover:bg-white/5"
              >
                退出流程
              </button>
            </div>
            <div className="flex items-center gap-1">
              {activeFlow.combo.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                  {i > 0 && <div className="flex-1 h-px bg-white/10 min-w-[8px]" />}
                  <div
                    className={`flex flex-col items-center gap-0.5 ${i === activeFlow.currentStep ? 'text-blue-300' : i < activeFlow.currentStep ? 'text-green-300/60' : 'text-gray-600'}`}
                    title={step.label}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      i === activeFlow.currentStep ? 'bg-blue-500 text-white' :
                      i < activeFlow.currentStep ? 'bg-green-500/20 text-green-300' :
                      'bg-white/5 text-gray-500'
                    }`}>
                      {i < activeFlow.currentStep ? '✓' : i + 1}
                    </span>
                    <span className="text-[9px] text-center leading-tight max-w-[48px] truncate">{step.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 加载消息中 */}
        {isLoadingMessages && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-sm text-gray-400">加载消息中...</span>
          </div>
        )}

        {messages.map((msg) => {
          // 对 assistant 消息，始终清理 choices 标签，避免显示原始 XML
          const cleaned = msg.type === 'assistant' ? parseChoices(msg.content).cleanedText : msg.content;
          const displayContent = cleaned || msg.content;

          return (
            <AgentMessage
              key={msg.id}
              type={msg.type}
              content={displayContent}
              toolCalls={msg.toolCalls.length > 0 ? msg.toolCalls : undefined}
              attachments={msg.attachments}
              generatedImages={msg.generatedImages}
              generatedVideo={msg.generatedVideo}
              generatedAudio={msg.generatedAudio}
              schedules={msg.schedules}
              scheduledItems={scheduledItems}
              schedulingId={schedulingId}
              onAddSchedule={(idx) => addToSchedule(msg, idx)}
              onAddAllSchedules={() => addToSchedule(msg)}
              messageId={msg.id}
              timestamp={msg.timestamp}
              onCopy={() => handleCopy(msg)}
              onRegenerate={msg.type === 'assistant' ? () => handleRegenerate(msg) : undefined}
              onDelete={() => handleDelete(msg)}
              onSaveToInspiration={msg.type === 'assistant' ? () => handleSaveToInspiration(msg) : undefined}
              onSpeak={msg.type === 'assistant' ? () => handleSpeak(msg) : undefined}
              onShare={msg.type === 'assistant' ? () => handleShare(msg) : undefined}
              isCopied={copiedId === msg.id || copiedId === 'saved_' + msg.id || copiedId === 'shared_' + msg.id}
              isRegenerating={regeneratingId === msg.id}
            />
          );
        })}

        {/* 交互式选项卡片 — 最后一条 assistant 消息包含 choices 时显示 */}
        {(() => {
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.type !== 'assistant' || isStreaming) return null;
          const { choices } = parseChoices(lastMsg.content);
          if (choices.length === 0) return null;

          const hasAnySelection = Array.from(choiceSelections.values()).some(
            s => s.options.length > 0 || s.customInput.trim()
          );

          return (
            <div className="px-4">
              {choices.map((block, i) => (
                <ChoiceCards
                  key={i}
                  block={block}
                  onChange={(sel) => {
                    setChoiceSelections(prev => {
                      const next = new Map(prev);
                      next.set(i, sel);
                      return next;
                    });
                  }}
                />
              ))}

              {/* 统一发送选择按钮 — 最下方 */}
              <button
                onClick={handleChoiceSubmit}
                disabled={!hasAnySelection || choiceSubmitting}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: hasAnySelection
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  color: hasAnySelection ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  opacity: choiceSubmitting ? 0.6 : 1,
                  cursor: hasAnySelection ? 'pointer' : 'default',
                }}
              >
                {choiceSubmitting ? (
                  <>处理中...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    发送选择
                  </>
                )}
              </button>
            </div>
          );
        })()}

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

      {/* 上传错误提示 */}
      {uploadError && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto w-fit max-w-[448px] px-4 z-30">
          <div className="p-2 rounded-lg flex items-center gap-2 text-xs bg-red-500/15 border border-red-500/30 text-red-300">
            <span>{uploadError}</span>
            <button className="ml-auto" onClick={() => setUploadError(null)}>✕</button>
          </div>
        </div>
      )}

      {/* 输入区域 — 固定置底 */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A1629]/95 backdrop-blur-lg border-t border-white/10 px-4 py-3 z-10" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="relative">
        {isRecording ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 animate-mic-pulse">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                  <path d="M19 11a7 7 0 01-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span className="font-mono text-sm tabular-nums text-red-300">{formatTime(recordingTime)}</span>
                <div className="flex-1 px-3 py-1.5 rounded-xl text-sm min-h-[32px] flex items-center bg-gray-800/80 border border-white/5 text-gray-200">
                  {liveTranscript ? (
                    <>
                      <span className="truncate">{liveTranscript}</span>
                      <span className="inline-block w-1 h-4 bg-blue-400 ml-1 animate-pulse flex-shrink-0" />
                    </>
                  ) : (
                    <span className="text-gray-500">正在聆听...</span>
                  )}
                </div>
                <button onClick={cancelRecording} className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-400 border border-white/10">
                  取消
                </button>
              </div>
            </div>
            <p className="text-center text-[11px] text-gray-500">松开发送，上滑可取消</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* 附件预览 */}
            {attachedFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {attachedFiles.map(af => (
                  <div key={af.id} className="relative flex-shrink-0">
                    {af.type === 'document' ? (
                      <div className="w-14 h-14 rounded-lg border border-gray-700 flex flex-col items-center justify-center gap-0.5 bg-blue-500/10">
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 truncate max-w-[48px] leading-none">
                          {af.file.name.split('.').pop()?.toUpperCase()}
                        </span>
                      </div>
                    ) : af.type === 'video' ? (
                      <div className="w-14 h-14 rounded-lg border border-gray-700 flex flex-col items-center justify-center gap-0.5 bg-purple-500/10 relative">
                        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 mt-0.5">视频</span>
                      </div>
                    ) : (
                      <img src={af.preview} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                    )}
                    <button
                      onClick={() => removeAttachedFile(af.id)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center"
                    >
                      <svg className="w-2 h-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 斜杠指令下拉 */}
            {slashMenu.show && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden z-50 max-h-[260px] overflow-y-auto"
                style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}
              >
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-gray-500">没有匹配的技能指令</p>
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
                        <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-200">{cmd.command}</p>
                        <p className="text-[11px] text-gray-500 truncate">{cmd.label} — {cmd.desc}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 输入框 */}
            <div className="flex items-end gap-1.5">
              {/* 工具按钮 */}
              <div className="relative flex items-end pb-1">
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <svg className={`w-5 h-5 text-gray-400 ${showTools ? 'rotate-45' : ''} transition-transform`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
                {showTools && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowTools(false)} />
                    <div className="absolute bottom-12 left-0 z-40 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-1.5 w-36">
                      <button onClick={handlePickImage} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        图片
                      </button>
                      <button onClick={handlePickVideo} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        视频
                      </button>
                      <button onClick={handlePickDocument} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        文档
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInput(val);
                    // 粘贴后跳过实时校验，延迟重置标记
                    if (isPastingRef.current) {
                      isPastingRef.current = false;
                      return;
                    }
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
                    // 去抖 150ms — 预留给搜索/API 调用等重操作
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = setTimeout(() => {
                      // 此处可接入搜索建议等 debounced 操作
                    }, 150);
                  }}
                  onPaste={() => {
                    isPastingRef.current = true;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={attachedFiles.length > 0 ? '添加描述...' : '说说你想创作什么...'}
                  rows={1}
                  className="w-full bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none max-h-[120px] py-0.5"
                  disabled={isStreaming}
                />
              </div>

              {/* 发送 / 语音按钮 */}
              {isStreaming ? (
                <button
                  onClick={handleAbort}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (input.trim() || attachedFiles.length > 0) ? (
                <button
                  onClick={handleSend}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              ) : (
                <button
                  onPointerDown={handlePressStart}
                  onPointerUp={handlePressEnd}
                  onPointerCancel={handlePressEnd}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  onTouchCancel={handlePressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  className="flex-shrink-0 w-12 h-9 rounded-full flex items-center justify-center select-none touch-none active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)' }}
                  title="按住说话"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path d="M19 11a7 7 0 01-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
