// ====== Capture 页面 Hooks ======

import { useState, useRef, useCallback, useEffect } from 'react';
import { useCreateInspiration } from '@/hooks/use-inspiration';
import { useCreateSchedule } from '@/hooks/use-schedule';
import { syncDevAuthCookie } from '@/lib/dev-auth';
import { stripMarkdown } from '@/lib/text-utils';
import { useToast } from '@/components/Toast';
import type { Message, ChatSession } from './types';

// ====== 会话管理 ======

export function useSessionManager() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadSessions = async () => {
    setIsLoadingHistory(true);
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/chat/history');
      const data = await res.json();
      const list: ChatSession[] = data.data || [];
      setSessions(list);
      return list;
    } catch (e) {
      console.warn('加载历史失败:', e);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadSessionMessages = async (sessionId: string): Promise<Message[]> => {
    try {
      syncDevAuthCookie();
      const res = await fetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      if (data.data?.messages) {
        return data.data.messages.map((m: any) => ({
          id: m.id,
          type: m.type as Message['type'],
          content: m.content,
          contentType: m.content_type || 'text',
          attachments: m.attachments || undefined,
          generatedImage: m.metadata?.generatedImage || undefined,
          generatedVideo: m.metadata?.generatedVideo || undefined,
          timestamp: new Date(m.created_at),
        }));
      }
    } catch (e) {
      console.warn('加载消息失败:', e);
    }
    return [];
  };

  const createSession = async (title?: string) => {
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_session', title }),
      });
      const data = await res.json();
      const session = data.data;
      if (session) {
        setSessions(prev => [session, ...prev]);
        setCurrentSessionId(session.id);
      }
      return session;
    } catch (e) {
      console.error('创建会话失败:', e);
      return null;
    }
  };

  const saveMessages = async (sessionId: string, msgs: any[]) => {
    try {
      syncDevAuthCookie();
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_messages', session_id: sessionId, messages: msgs }),
      });
    } catch (e) {
      console.error('保存消息失败:', e);
    }
  };

  const switchSession = (session: ChatSession, loadFn: (id: string) => void) => {
    setCurrentSessionId(session.id);
    loadFn(session.id);
    setShowSessionList(false);
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      syncDevAuthCookie();
      await fetch(`/api/chat/history?session_id=${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          setCurrentSessionId(remaining[0].id);
        } else {
          setCurrentSessionId(null);
        }
      }
    } catch (e) {
      console.error('删除会话失败:', e);
    }
  };

  const updateSessionTitle = async (sessionId: string, title: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
    try {
      syncDevAuthCookie();
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_title', session_id: sessionId, title }),
      });
    } catch (e) {
      console.error('更新会话标题失败:', e);
    }
  };

  return {
    sessions, setSessions,
    currentSessionId, setCurrentSessionId,
    showSessionList, setShowSessionList,
    isLoadingHistory,
    loadSessions,
    loadSessionMessages,
    createSession,
    saveMessages,
    switchSession,
    deleteSession,
    updateSessionTitle,
  };
}

// ====== 消息操作 ======

export function useMessageActions() {
  const { showToast } = useToast();
  const createInspiration = useCreateInspiration();
  const createSchedule = useCreateSchedule();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduledItems, setScheduledItems] = useState<Set<string>>(new Set());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const copyMessage = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      console.error('复制失败：剪贴板不可用');
    }
  }, []);

  const shareMessage = useCallback(async (msg: Message) => {
    if (navigator.share) {
      try { await navigator.share({ text: msg.content }); } catch { /* ignore */ }
    } else {
      await copyMessage(msg);
    }
  }, [copyMessage]);

  const modifyMessage = useCallback((msg: Message, setInputText: (t: string) => void, _setMessages: (fn: (prev: Message[]) => Message[]) => void, textareaRef: React.RefObject<HTMLTextAreaElement | null>) => {
    setInputText(msg.content);
    textareaRef.current?.focus();
  }, []);

  const deleteMessage = useCallback((msg: Message, setMessages: (fn: (prev: Message[]) => Message[]) => void) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  }, []);

  const speakMessage = useCallback(async (msg: Message) => {
    // 1. 同条再点 → 停止
    if (speakingId === msg.id) {
      stopSpeakingInternal();
      return;
    }
    // 2. 停掉之前的任何播放
    stopSpeakingInternal();
    setSpeakingId(msg.id);

    // 标记是否已被 API TTS 替换（避免 browser TTS 结束后又清状态）
    let switchedToApi = false;
    // 标记是否已被外部停止
    let stopped = false;

    // 3. 先用浏览器 TTS 立即开始播报（0 延迟）
    let browserTtsStarted = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg.content);
        u.lang = 'zh-CN';
        u.rate = 1.15;
        u.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => /^zh/i.test(v.lang));
        if (zhVoice) u.voice = zhVoice;
        u.onend = () => {
          synthRef.current = null;
          if (!switchedToApi && !stopped) {
            setSpeakingId(prev => (prev === msg.id ? null : prev));
          }
        };
        u.onerror = () => {
          synthRef.current = null;
          if (!switchedToApi && !stopped) {
            setSpeakingId(prev => (prev === msg.id ? null : prev));
          }
        };
        synthRef.current = u;
        window.speechSynthesis.speak(u);
        browserTtsStarted = true;
      } catch (e) {
        console.warn('[TTS] 浏览器 TTS 启动失败:', e);
      }
    }

    // 4. 并行请求 API TTS（替换浏览器 TTS 为高质量音频）
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.content }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.audioBase64) {
          // API TTS 就绪 → 停掉浏览器 TTS，切换到 API 音频
          if (stopped) return;
          switchedToApi = true;
          if (browserTtsStarted) {
            try { window.speechSynthesis.cancel(); } catch { /* noop */ }
            synthRef.current = null;
          }

          const dataUrl = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`;
          const audio = new Audio(dataUrl);
          audioRef.current = { audio, url: dataUrl };
          audio.onended = () => {
            audioRef.current = null;
            setSpeakingId(prev => (prev === msg.id ? null : prev));
          };
          audio.onerror = () => {
            audioRef.current = null;
            setSpeakingId(prev => (prev === msg.id ? null : prev));
          };
          await audio.play();
          return;
        }
      }
    } catch (e) {
      console.warn('[TTS] API TTS 失败，继续使用浏览器 TTS:', e);
    }

    // 5. 如果浏览器 TTS 也没启动成功
    if (!browserTtsStarted) {
      setSpeakingId(null);
      showToast('当前环境不支持语音播报', 'error');
    }
  }, [speakingId, showToast]);

  const stopSpeaking = useCallback(() => {
    stopSpeakingInternal();
  }, []);

  // 内部停止(不通过 callback 引用避免循环)
  function stopSpeakingInternal() {
    if (audioRef.current) {
      audioRef.current.audio.pause();
      audioRef.current.audio.src = '';
      URL.revokeObjectURL(audioRef.current.url);
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    synthRef.current = null;
    setSpeakingId(null);
  }

  const regenerateMessage = useCallback(async (msg: Message, messages: Message[], sessionId?: string | null) => {
    const idx = messages.findIndex(m => m.id === msg.id);
    if (idx < 1) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].type !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    setRegeneratingId(msg.id);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMsg.content, session_id: sessionId || undefined }),
      });
      const data = await res.json();
      const scheduleData = data.schedules || (data.schedule ? [data.schedule] : undefined);
      return {
        content: data.response || data.summary || data.title || '已收到',
        schedule: data.schedule || undefined,
        schedules: scheduleData,
      };
    } catch { return null; } finally {
      setRegeneratingId(null);
    }
  }, []);

  const saveToInspiration = useCallback(async (msg: Message, allMessages: Message[]) => {
    // 找到该 AI 消息前面的用户消息作为原素材
    const idx = allMessages.findIndex(m => m.id === msg.id);
    let userMsg: Message | null = null;
    if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        if (allMessages[i].type === 'user') {
          userMsg = allMessages[i];
          break;
        }
      }
    }
    const originalText = userMsg ? userMsg.content : msg.content;

    setSavingId(msg.id);
    try {
      syncDevAuthCookie();

      // 收集原素材中的媒体文件（含生成结果）
      const mediaUrls = [
        ...(userMsg?.attachments?.map(a => a.url) || []),
        ...(msg.attachments?.map(a => a.url) || []),
        ...(msg.generatedImage?.imageUrl ? [msg.generatedImage.imageUrl] : []),
        ...(msg.generatedVideo?.videoUrl ? [msg.generatedVideo.videoUrl] : []),
      ];

      const hasGenVideo = !!msg.generatedVideo?.videoUrl;
      const hasGenImage = !!msg.generatedImage?.imageUrl;
      const cleanText = stripMarkdown(originalText);
      await createInspiration.mutateAsync({
        type: hasGenVideo ? 'video' as any
            : hasGenImage ? 'image' as any
            : userMsg?.attachments?.some(a => a.type === 'video') ? 'video' as any
            : userMsg?.attachments?.some(a => a.type === 'image') ? 'image' as any
            : 'text' as any,
        title: cleanText.length > 20 ? cleanText.substring(0, 20) + '...' : cleanText,
        original_text: originalText,
        summary: msg.content,
        tags: ['灵感'],
        source_url: userMsg?.sourceUrl,
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
      });
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error('保存灵感失败:', e);
      throw e;
    } finally {
      setSavingId(null);
    }
  }, [createInspiration]);

  const addToSchedule = useCallback(async (msg: Message, _allMessages: Message[], scheduleIndex?: number) => {
    const list = msg.schedules || (msg.schedule ? [msg.schedule] : null);
    if (!list) return;
    // 单个添加时只加指定项；全部添加时跳过已添加的
    const itemsToAdd = scheduleIndex !== undefined
      ? [list[scheduleIndex]]
      : list.filter((_, i) => !scheduledItems.has(`${msg.id}-${i}`));
    if (itemsToAdd.length === 0) return;
    setSchedulingId(msg.id);
    try {
      syncDevAuthCookie();

      for (const s of itemsToAdd) {
        await createSchedule.mutateAsync({
          title: s.title,
          description: s.description || undefined,
          scheduled_at: s.scheduled_at,
          location: s.location || undefined,
          color: '#8B5CF6',
          remind_before: 30,
          suggestions: s.suggestions?.length ? s.suggestions : undefined,
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

      showToast(`已成功添加 ${itemsToAdd.length} 条日程到首页和日程库`, 'success');
      setTimeout(() => setSchedulingId(null), 2000);
    } catch (e: any) {
      const errMsg = e?.message || '未知错误';
      console.error('添加日程失败:', errMsg);
      showToast('添加日程失败: ' + errMsg, 'error');
      setSchedulingId(null);
    }
  }, [createSchedule, scheduledItems]);

  return {
    copiedId, regeneratingId, savingId, schedulingId, speakingId,
    setCopiedId, setRegeneratingId, setSavingId, setSchedulingId, setSpeakingId,
    copyMessage, shareMessage, modifyMessage, deleteMessage,
    speakMessage, stopSpeaking, regenerateMessage, saveToInspiration, addToSchedule,
    scheduledItems,
  };
}

// ====== 语音录制 ======

export function useVoiceRecording() {
  const { showToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldRestartRef = useRef(false);
  const stoppingRef = useRef(false);

  // 录音计时器
  useEffect(() => {
    if (isRecording && !isPolishing) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPolishing]);

  /** 调用标点+纠错 API，一次性处理全文 */
  const polishText = async (rawText: string): Promise<string> => {
    if (!rawText.trim()) return rawText;
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/ai/punctuate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      });
      if (!res.ok) return rawText;
      const data = await res.json();
      if (data.success && data.data?.text) {
        return data.data.text.trim();
      }
    } catch { /* ignore */ }
    return rawText;
  };

  /** 彻底清理录音状态 */
  const cleanupRecording = () => {
    shouldRestartRef.current = false;
    stoppingRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPolishing(false);
    setRecordingTime(0);
    setLiveTranscript('');
  };

  const startRecording = () => {
    // 防止重复启动和正在停止时启动
    if (recognitionRef.current || stoppingRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('您的浏览器不支持语音识别，请使用 Chrome 浏览器', 'warning'); return; }

    setIsRecording(true);
    setIsPolishing(false);
    setRecordingTime(0);
    setLiveTranscript('');
    finalTranscriptRef.current = '';
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          let best = result[0].transcript;
          let bestConf = result[0].confidence || 0;
          for (let j = 1; j < result.length; j++) {
            if ((result[j].confidence || 0) > bestConf) {
              best = result[j].transcript;
              bestConf = result[j].confidence;
            }
          }
          finalTranscriptRef.current += best;
        } else {
          interim += result[0].transcript;
        }
      }
      setLiveTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        showToast('请允许使用麦克风权限', 'warning');
        cleanupRecording();
      }
    };

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          cleanupRecording();
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      showToast('无法启动语音识别，请检查麦克风权限', 'warning');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (stoppingRef.current) return ''; // 防止重复调用
    stoppingRef.current = true;
    shouldRestartRef.current = false;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }

    const rawText = finalTranscriptRef.current.trim();

    if (!rawText) {
      cleanupRecording();
      return '';
    }

    // 保持录音 UI，显示优化中
    setIsPolishing(true);
    setLiveTranscript('正在优化识别结果…');

    const polished = await polishText(rawText);

    cleanupRecording();
    return polished;
  };

  const cancelRecording = () => {
    stoppingRef.current = false;
    cleanupRecording();
  };

  return {
    isRecording, setIsRecording,
    recordingTime, setRecordingTime,
    liveTranscript,
    isPolishing,
    recognitionRef,
    startRecording, stopRecording, cancelRecording,
  };
}

// ====== 文件上传 ======

export function useFileUpload() {
  const { showToast } = useToast();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    const isDoc = file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'text/plain' ||
      file.type === 'text/markdown';
    formData.append('type', isDoc ? 'document' : (file.type.startsWith('image') ? 'image' : 'video'));
    try {
      syncDevAuthCookie();
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) { setUploadError(data.error || '上传失败'); return null; }
      setUploadError(null);
      return data.data.url;
    } catch { setUploadError('网络错误，上传失败'); return null; }
  };

  const validateFile = (file: File, type: 'image' | 'video' | 'document'): boolean => {
    if (type === 'document') {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
      const validExts = ['.pdf', '.docx', '.txt', '.md'];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const mimeOk = validTypes.includes(file.type);
      const extOk = validExts.includes(ext);
      const maxSize = 20 * 1024 * 1024;
      if (!mimeOk && !extOk) { showToast('仅支持 PDF/DOCX/TXT/MD 格式', 'warning'); return false; }
      if (file.size > maxSize) { showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 20MB`, 'warning'); return false; }
      return true;
    }
    const validTypes = type === 'image'
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    const maxSize = type === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!validTypes.includes(file.type)) { showToast('格式不支持', 'warning'); return false; }
    if (file.size > maxSize) { showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB）`, 'warning'); return false; }
    return true;
  };

  return {
    uploadError, setUploadError,
    objectUrlsRef,
    uploadFile, validateFile,
  };
}

// ====== 流式 TTS（逐句朗读 AI 实时生成内容） ======

export function useStreamTTS() {
  const [isStreamPlaying, setIsStreamPlaying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);

  const speakNext = useCallback(() => {
    if (speakingRef.current) return;
    if (queueRef.current.length === 0) {
      setIsStreamPlaying(false);
      return;
    }
    const sentence = queueRef.current.shift()!;
    if (!sentence.trim()) {
      speakNext();
      return;
    }
    speakingRef.current = true;
    try {
      const u = new SpeechSynthesisUtterance(sentence);
      u.lang = 'zh-CN';
      u.rate = 1.15;
      u.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => /^zh/i.test(v.lang));
      if (zhVoice) u.voice = zhVoice;
      u.onend = () => {
        speakingRef.current = false;
        speakNext();
      };
      u.onerror = () => {
        speakingRef.current = false;
        speakNext();
      };
      window.speechSynthesis.speak(u);
    } catch {
      speakingRef.current = false;
      speakNext();
    }
  }, []);

  const startStream = useCallback(async (content: string, searchResults?: unknown[]) => {
    // 停止之前播放
    stopStream();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, searchResults }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) return;

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let textBuffer = '';

      setIsStreamPlaying(true);

      const sentenceBreakers = /[。！？；\n]/;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'chunk' && data.content) {
              textBuffer += data.content;
              // 检测句子边界
              const parts = textBuffer.split(sentenceBreakers);
              // 最后一部分可能是不完整句子，保留
              if (parts.length > 1) {
                for (let i = 0; i < parts.length - 1; i++) {
                  const sentence = parts[i].trim();
                  if (sentence) queueRef.current.push(sentence);
                }
                textBuffer = parts[parts.length - 1] || '';
                speakNext();
              }
            } else if (data.type === 'done') {
              // 输出剩余文本
              if (textBuffer.trim()) {
                queueRef.current.push(textBuffer.trim());
                speakNext();
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.warn('[StreamTTS] 流式播放失败:', e);
      }
    }
  }, [speakNext]);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    speakingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    setIsStreamPlaying(false);
  }, []);

  return { isStreamPlaying, startStream, stopStream };
}
