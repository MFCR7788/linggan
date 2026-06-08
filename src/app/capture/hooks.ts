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

  const modifyMessage = useCallback((msg: Message, setInputText: (t: string) => void, setMessages: (fn: (prev: Message[]) => Message[]) => void, textareaRef: React.RefObject<HTMLTextAreaElement | null>) => {
    setInputText(msg.content);
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
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
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldRestartRef = useRef(false);
  const punctuateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPunctuatedLenRef = useRef(0);
  const punctuatedTextRef = useRef('');

  // 录音计时器
  useEffect(() => {
    if (isRecording) {
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
  }, [isRecording]);

  // 清理标点定时器
  useEffect(() => {
    return () => {
      if (punctuateTimerRef.current) clearTimeout(punctuateTimerRef.current);
    };
  }, []);

  // 实时补标点（防抖 1.5s，只发送新增的已确认文本）
  const schedulePunctuate = () => {
    if (punctuateTimerRef.current) clearTimeout(punctuateTimerRef.current);
    punctuateTimerRef.current = setTimeout(async () => {
      const fullText = finalTranscriptRef.current;
      const newPart = fullText.slice(lastPunctuatedLenRef.current);
      if (!newPart.trim()) return;

      try {
        const res = await fetch('/api/ai/punctuate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newPart }),
        });
        const data = await res.json();
        if (data.success && data.data?.text) {
          punctuatedTextRef.current = punctuatedTextRef.current + data.data.text;
          lastPunctuatedLenRef.current = fullText.length;
          // 更新实时显示
          let interim = '';
          // 从当前 liveTranscript 提取 interim 部分
          const currentLive = fullText; // 这是 final 部分
          // 重新触发显示更新（下次 onresult 会用到 punctuatedTextRef）
        }
      } catch { /* ignore */ }
    }, 1500);
  };

  const startRecording = () => {
    // 防止 pointer + touch 双事件同时触发导致重复启动
    if (recognitionRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast('您的浏览器不支持语音识别，请使用 Chrome 浏览器', 'warning'); return; }

    setIsRecording(true);
    setRecordingTime(0);
    setLiveTranscript('');
    finalTranscriptRef.current = '';
    punctuatedTextRef.current = '';
    lastPunctuatedLenRef.current = 0;
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      // 实时显示：已补标点的部分 + 待补标点的新文本 + 临时结果
      const newUnpunctuated = finalTranscriptRef.current.slice(lastPunctuatedLenRef.current);
      setLiveTranscript(punctuatedTextRef.current + newUnpunctuated + interim);
      // 有新确认文本时触发补标点
      if (newUnpunctuated.trim()) {
        schedulePunctuate();
      }
    };

    recognition.onerror = (event: any) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        showToast('请允许使用麦克风权限', 'warning');
        shouldRestartRef.current = false;
        setIsRecording(false);
        setRecordingTime(0);
      }
      // 'no-speech', 'aborted' 等错误不中断，让 onend 处理重连
    };

    recognition.onend = () => {
      // Chrome 桌面端会在静默后自动停止，自动重启
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          // 如果无法重启（如权限被撤销），停止录音
          shouldRestartRef.current = false;
          setIsRecording(false);
          setRecordingTime(0);
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopRecording = async () => {
    shouldRestartRef.current = false;
    if (punctuateTimerRef.current) {
      clearTimeout(punctuateTimerRef.current);
      punctuateTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // 最后一次补标点：发送剩余未处理文本
    const remaining = finalTranscriptRef.current.slice(lastPunctuatedLenRef.current);
    let finalText = punctuatedTextRef.current + remaining;
    if (remaining.trim()) {
      try {
        const res = await fetch('/api/ai/punctuate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: remaining }),
        });
        const data = await res.json();
        if (data.success && data.data?.text) {
          finalText = punctuatedTextRef.current + data.data.text;
        }
      } catch { /* ignore */ }
    }
    const transcript = finalText.trim() || finalTranscriptRef.current.trim();
    setIsRecording(false);
    setRecordingTime(0);
    setLiveTranscript('');
    return transcript;
  };

  const cancelRecording = () => {
    shouldRestartRef.current = false;
    if (punctuateTimerRef.current) {
      clearTimeout(punctuateTimerRef.current);
      punctuateTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
    setLiveTranscript('');
  };

  return {
    isRecording, setIsRecording,
    recordingTime, setRecordingTime,
    liveTranscript,
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
