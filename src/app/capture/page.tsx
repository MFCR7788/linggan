"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, Image as ImageIcon, Video, Send, Sparkles, X,
  Clipboard, Check, Share2, Edit3, Trash, Volume2, RefreshCw,
  BookmarkPlus, Globe, Loader2, PenLine, ChevronDown,
  Plus, History, FileText, Cpu, Maximize2, Minimize2, SquarePen
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { ProtectedRoute } from "@/components";
import FormattedText from "@/components/FormattedText";
import type { Message, AttachedFile } from "./types";
import { REWRITE_STYLES } from "./types";
import { useSessionManager, useMessageActions, useVoiceRecording, useFileUpload } from "./hooks";
import { ActionBtn, UserActions, AiActions } from "./components";
import { useToast } from "@/components/Toast";

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

function CaptureContent() {
  const router = useRouter();
  const { showToast } = useToast();

  // 会话管理
  const sessionMgr = useSessionManager();
  const {
    sessions, currentSessionId, setCurrentSessionId, showSessionList, setShowSessionList,
    isLoadingHistory, loadSessions, loadSessionMessages, createSession,
    saveMessages, switchSession, deleteSession, updateSessionTitle,
  } = sessionMgr;

  // 消息操作
  const msgActions = useMessageActions();
  const {
    copiedId, regeneratingId, savingId, schedulingId, speakingId,
    copyMessage, shareMessage, modifyMessage, deleteMessage,
    speakMessage, regenerateMessage, saveToInspiration, addToSchedule,
  } = msgActions;

  // 语音
  const voice = useVoiceRecording();
  const { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording } = voice;

  // 文件上传
  const fileUpload = useFileUpload();
  const { uploadError, setUploadError, objectUrlsRef, uploadFile, validateFile } = fileUpload;

  // 本地状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showRewritePicker, setShowRewritePicker] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("auto");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const MODEL_OPTIONS = [
    { id: "auto", label: "自动选择", desc: "根据内容自动切换最优模型" },
    { id: "deepseek", label: "DeepSeek", desc: "文本处理，成本低" },
    { id: "qwen-plus", label: "千问", desc: "文本处理，能力强" },
    { id: "qwen-vl-plus", label: "千问视觉", desc: "图片/视频识别" },
    { id: "doubao", label: "豆包", desc: "文本+视觉" },
  ] as const;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionLoadedRef = useRef(false);

  // ====== Effects ======

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自动调整输入框高度 + 检测是否多行
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const scrollH = ta.scrollHeight;
    ta.style.height = Math.min(scrollH, 160) + 'px';
    setShowExpandBtn(scrollH > 40);
  }, [inputText]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => { urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [objectUrlsRef]);

  // 加载会话列表
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    loadSessions().then(list => {
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
        loadSessionMessages(list[0].id).then(msgs => setMessages(msgs));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 视频分析 ======

  const handleAnalyzeVideo = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type)) { showToast('格式不支持，请使用 MP4/MOV/AVI/WebM', 'warning'); return; }
      if (file.size > 100 * 1024 * 1024) { showToast(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 100MB`, 'warning'); return; }

      setIsAnalyzingVideo(true);
      setIsAnalyzing(true);

      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        contentType: 'video',
        content: file.name,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      try {
        const videoFormData = new FormData();
        videoFormData.append('file', file);
        videoFormData.append('type', 'video');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: videoFormData });
        const uploadData = await uploadRes.json();
        const videoUrl = uploadData.data?.url || '';

        const chatBody: any = { content: '请分析这个视频内容，描述你看到了什么，给出有价值的见解。', videos: videoUrl ? [videoUrl] : [], session_id: currentSessionId, model: selectedModel };
        const chatRes = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chatBody) });
        const chatData = await chatRes.json();

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: chatData.response || chatData.summary || '视频分析完成',
          contentType: 'text',
          attachments: [{ url: videoUrl, name: file.name, type: 'video' as const }],
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMsg]);
      } catch {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'ai', content: '视频分析失败，请重试。', timestamp: new Date() }]);
      } finally {
        setIsAnalyzingVideo(false);
        setIsAnalyzing(false);
      }
    };
    input.click();
  };

  // ====== 视频任务轮询 ======

  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const pollVideoTask = (msgId: string, taskId: string) => {
    // 清除已有轮询
    const existing = pollingRefs.current.get(msgId);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/chat?action=video_status&taskId=${taskId}`);
        const data = await res.json();
        if (!data.success) return;

        setMessages(prev => prev.map(m => {
          if (m.id !== msgId || !m.generatedVideo) return m;
          return {
            ...m,
            generatedVideo: {
              ...m.generatedVideo,
              status: data.data?.status || m.generatedVideo.status,
              videoUrl: data.data?.videoUrl || m.generatedVideo.videoUrl,
            }
          };
        }));

        if (data.data?.status === 'succeeded' || data.data?.status === 'failed') {
          clearInterval(timer);
          pollingRefs.current.delete(msgId);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);

    pollingRefs.current.set(msgId, timer);
  };

  // ====== 图生图 / 图生视频 ======

  const handleImg2Img = async (msg: Message) => {
    const imgUrls = msg.attachments?.filter(a => a.type === 'image').map(a => a.url);
    if (!imgUrls || imgUrls.length === 0) return;

    const key = `img2img-${msg.id}`;
    setGeneratingId(key);

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      contentType: 'text',
      content: '以这张图为参考，生成一张新的图片',
      attachments: msg.attachments,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMsg.content, images: imgUrls, session_id: currentSessionId, model: selectedModel }),
      });
      const data = await res.json();
      const aiContent = data.response || '已生成';

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiContent,
        contentType: 'text',
        generatedImage: data.generatedImage || undefined,
        generatedVideo: data.generatedVideo || undefined,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);

      if (data.generatedVideo?.taskId) {
        pollVideoTask(aiMsg.id, data.generatedVideo.taskId);
      }

      if (currentSessionId) {
        saveMessages(currentSessionId, [
          { type: 'user', content: userMsg.content, content_type: userMsg.contentType, attachments: userMsg.attachments },
          { type: 'ai', content: aiContent, content_type: 'text', metadata: data.generatedImage ? { generatedImage: data.generatedImage } : undefined },
        ]);
      }
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'ai', content: '生成失败，请重试', timestamp: new Date() }]);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleImg2Vid = async (msg: Message) => {
    // 暂停视频生成，引导用户前往 AI 生视频流程
    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      type: 'ai',
      content: '请用AI生视频流程生成视频！',
      contentType: 'text',
      timestamp: new Date(),
    }]);
    router.push('/ai/video');
  };

  // ====== AI 消息生成视频 ======

  const handleText2Vid = async (msg: Message) => {
    // 暂停视频生成，引导用户前往 AI 生视频流程
    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      type: 'ai',
      content: '请用AI生视频流程生成视频！',
      contentType: 'text',
      timestamp: new Date(),
    }]);
    router.push('/ai/video');
  };

  // 轮询：AI 响应中包含 videoTaskId 时自动开始轮询
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === 'ai' && lastMsg.generatedVideo?.taskId && lastMsg.generatedVideo?.status === 'queued') {
      pollVideoTask(lastMsg.id, lastMsg.generatedVideo.taskId);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 改写 ======

  const handleRewriteClick = () => {
    if (inputText.trim().length < 10) return;
    setShowRewritePicker(true);
  };

  const executeRewrite = async (style: string) => {
    const text = inputText.trim();
    if (text.length < 10) return;
    setShowRewritePicker(false);
    setIsRewriting(true);

    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, style }),
      });
      const data = await res.json();
      if (data.success && data.response) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: data.response,
          contentType: 'text',
          timestamp: new Date(),
        }]);
      }
    } catch {
      showToast('改写失败，请重试', 'error');
    } finally {
      setIsRewriting(false);
    }
  };

  // ====== 发送消息 ======

  const sendMessage = async () => {
    const text = inputText.trim();
    const files = attachedFiles;
    if (!text && files.length === 0) return;

    setAttachedFiles([]);
    setInputText("");

    const uploadedImages: { url: string; name: string }[] = [];
    setIsAnalyzing(true);

    for (const af of files) {
      const url = await uploadFile(af.file);
      uploadedImages.push({ url: url || af.preview, name: af.file.name });
    }

    const hasImages = uploadedImages.length > 0;
    const isLink = !hasImages && (text.startsWith('http') || text.startsWith('www.'));

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      contentType: hasImages ? 'image' : (isLink ? 'link' : 'text'),
      content: text || (hasImages ? `📸 ${uploadedImages.length} 张图片` : ''),
      attachments: uploadedImages.length > 0
        ? uploadedImages.map(img => ({ url: img.url, name: img.name, type: 'image' as const }))
        : undefined,
      sourceUrl: isLink ? (text.startsWith('http') ? text : `https://${text}`) : undefined,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 联网搜索
    let searchResults: any[] | null = null;
    if (searchEnabled && text && !hasImages) {
      setIsSearching(true);
      let searchQuery = text
        .replace(/^(请?\s*帮我|请)\s*(搜[索]?|查|找|看)\s*一?[下看看]?\s*/i, '')
        .replace(/^请\s*/i, '')
        .replace(/^(查一?下|查查|搜索|查找|找一?下|找找|搜一下)\s*/i, '')
        .replace(/^(什么是|啥是|何为|如何|怎么|怎样|怎么样|为什么|为何)\s*/i, '')
        .replace(/(是什么|是啥|怎么做|怎么用|如何用|怎么创建|怎么实现|怎么玩|怎么搭)$/i, '')
        .replace(/[？?。，,！!；;：:、]+$/, '')
        .trim();
      if (!searchQuery || searchQuery.length < 2) searchQuery = text;
      try {
        const searchRes = await fetch('/api/ai/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });
        const searchData = await searchRes.json();
        if (searchData.success && searchData.results.length > 0) searchResults = searchData.results;
      } catch { /* ignore */ } finally {
        setIsSearching(false);
      }
    }

    // 调用 AI
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, images: uploadedImages.map(img => img.url), searchResults, session_id: currentSessionId, model: selectedModel }),
      });
      const data = await res.json();
      const aiContent = data.response || data.summary || data.title || '已收到';

      // 处理日程数据：优先用 AI 里的 schedule/schedules，没有则后台提取
      let scheduleData = data.schedules || (data.schedule ? [data.schedule] : undefined);

      if (!scheduleData) {
        // AI 可能没返回日程结构（如 life 意图），把 AI 分析也传给 extract-schedule 以提取详细信息
        try {
          const extractRes = await fetch('/api/ai/extract-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, aiResponse: aiContent }),
          });
          const extractData = await extractRes.json();
          if (extractData.success && extractData.schedules?.length > 0) {
            scheduleData = extractData.schedules;
          }
        } catch { /* 提取失败不影响主流程 */ }
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiContent,
        contentType: 'text',
        generatedImage: data.generatedImage || undefined,
        generatedVideo: data.generatedVideo || undefined,
        schedule: data.schedule || undefined,
        schedules: scheduleData,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);

      // 保存到服务端（含生成结果的媒体信息）
      const aiMeta: Record<string, any> = { source: 'chat' };
      if (data.generatedImage) aiMeta.generatedImage = data.generatedImage;
      if (data.generatedVideo) aiMeta.generatedVideo = data.generatedVideo;

      if (currentSessionId) {
        saveMessages(currentSessionId, [
          { type: 'user', content: userMessage.content, content_type: userMessage.contentType, attachments: userMessage.attachments },
          { type: 'ai', content: aiContent, content_type: 'text', metadata: Object.keys(aiMeta).length > 0 ? aiMeta : undefined },
        ]);
      } else {
        const session = await createSession(text.substring(0, 30) + (text.length > 30 ? '...' : ''));
        if (session) {
          saveMessages(session.id, [
            { type: 'user', content: userMessage.content, content_type: userMessage.contentType, attachments: userMessage.attachments },
            { type: 'ai', content: aiContent, content_type: 'text', metadata: Object.keys(aiMeta).length > 0 ? aiMeta : undefined },
          ]);
        }
      }
    } catch {
      const errorMsg: Message = { id: (Date.now() + 1).toString(), type: 'ai', content: '抱歉，处理失败，请重试。', timestamp: new Date() };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ====== 文件附件 ======

  const attachImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !validateFile(file, 'image')) return;
      const preview = URL.createObjectURL(file);
      objectUrlsRef.current.push(preview);
      setAttachedFiles(prev => [...prev, { id: Date.now().toString(), file, preview, type: 'image' }]);
    };
    input.click();
  };

  const removeAttachedFile = (id: string) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) { URL.revokeObjectURL(file.preview); objectUrlsRef.current = objectUrlsRef.current.filter(u => u !== file.preview); }
      return prev.filter(f => f.id !== id);
    });
  };

  const handleModify = (msg: Message) => {
    modifyMessage(msg, setInputText, setMessages, textareaRef);
  };

  const handleDelete = (msg: Message) => {
    deleteMessage(msg, setMessages);
  };

  const handleRegenerate = async (msg: Message) => {
    const result = await regenerateMessage(msg, messages, currentSessionId);
    if (result) {
      let schedules = result.schedules;

      // 如果 AI 没返回日程结构，尝试从原用户文本提取
      if (!schedules) {
        const userMsg = messages.find(m => m.type === 'user' && m.id < msg.id && !messages.some(mm => mm.type === 'ai' && mm.id > m.id && mm.id < msg.id));
        if (userMsg) {
          try {
            const extractRes = await fetch('/api/ai/extract-schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: userMsg.content, aiResponse: result.content }),
            });
            const extractData = await extractRes.json();
            if (extractData.success && extractData.schedules?.length > 0) {
              schedules = extractData.schedules;
            }
          } catch { /* ignore */ }
        }
      }

      setMessages(prev => prev.map(m => m.id === msg.id ? {
        ...m,
        content: result.content,
        schedule: result.schedule,
        schedules,
        timestamp: new Date(),
      } : m));
    }
  };

  const handleSwitchSession = (session: any) => {
    switchSession(session, (id) => {
      loadSessionMessages(id).then(msgs => setMessages(msgs));
    });
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    deleteSession(e, sessionId);
    if (currentSessionId === sessionId) {
      setMessages([]);
    }
  };

  const startNewSession = () => {
    createSession();
    setMessages([]);
    setShowSessionList(false);
  };

  const handleVoiceStop = async () => {
    const transcript = await stopRecording();
    if (!transcript) return;
    setInputText(prev => prev + transcript);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ====== Render ======

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <TopNav
        title={
          <button onClick={() => setShowSessionList(!showSessionList)} className="flex items-center gap-1.5 max-w-[200px]">
            <History size={16} color="#9CA3AF" />
            <span className="truncate text-sm">
              {currentSessionId
                ? sessions.find(s => s.id === currentSessionId)?.title || '灵感助手'
                : '灵感助手'}
            </span>
            <ChevronDown size={14} color="#6B7280" />
          </button>
        }
        showBack
        onBack={() => router.push("/home")}
      />

      {/* 会话列表下拉 */}
      {showSessionList && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowSessionList(false)} />
          <div className="absolute top-12 left-3 z-30 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-72 overflow-y-auto">
            <div className="p-2 border-b border-gray-700">
              <button onClick={startNewSession} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm">
                <Plus size={16} /> 新对话
              </button>
            </div>
            {isLoadingHistory ? (
              <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">暂无历史对话</div>
            ) : sessions.map(s => (
              <div
                key={s.id}
                onClick={() => {
                  if (editingSessionId !== s.id) handleSwitchSession(s);
                }}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-700/50 text-sm ${s.id === currentSessionId ? 'bg-gray-700/30 text-white' : 'text-gray-400'}`}
              >
                <FileText size={14} className="flex-shrink-0" />
                {editingSessionId === s.id ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateSessionTitle(s.id, editTitle.trim() || s.title);
                        setEditingSessionId(null);
                      }
                      if (e.key === 'Escape') setEditingSessionId(null);
                    }}
                    onBlur={() => {
                      updateSessionTitle(s.id, editTitle.trim() || s.title);
                      setEditingSessionId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-gray-700 text-white text-sm px-2 py-0.5 rounded outline-none border border-blue-500 min-w-0"
                    autoFocus
                  />
                ) : (
                  <span
                    className="truncate flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSessionId(s.id);
                      setEditTitle(s.title);
                    }}
                    title="点击修改标题"
                  >
                    {s.title}
                  </span>
                )}
                <button
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0"
                >
                  <Trash size={12} color="#6B7280" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 错误提示 */}
      {uploadError && (
        <div className="mx-4 mt-2 p-2 rounded-lg flex items-center gap-2 text-xs" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
          <span>{uploadError}</span>
          <button className="ml-auto" onClick={() => setUploadError(null)}>✕</button>
        </div>
      )}

      {/* 聊天区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {messages.length === 0 && !isLoadingHistory && (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles size={28} color="white" />
            </div>
            <p className="text-gray-300 text-sm">你好！我是你的灵感助手</p>
            <p className="text-gray-500 text-xs mt-1">支持文字、图片、视频、语音、联网搜索</p>
          </div>
        )}

        {isLoadingHistory && (
          <div className="flex justify-center py-16">
            <Loader2 size={20} color="#6B7280" className="animate-spin" />
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className="group relative"
            onMouseEnter={() => setHoveredMessageId(msg.id)}
            onMouseLeave={() => setHoveredMessageId(null)}
          >
            <div className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] flex gap-2 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.type !== 'user' && (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <Sparkles size={14} color="white" />
                  </div>
                )}
                <div className={`px-3.5 py-2.5 ${msg.type === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-2xl rounded-bl-sm'}`}>
                  <div className="text-sm leading-relaxed">
                    {msg.attachments?.filter(a => a.type === 'video').map((att, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2 text-gray-400 text-xs">
                        <Video size={14} className="text-purple-400" />
                        <span className="truncate max-w-[200px]">{att.name}</span>
                      </div>
                    ))}
                    {msg.attachments?.filter(a => a.type === 'image').map((att, i) => (
                      <img key={i} src={att.url} alt="" loading="lazy" className="max-w-[180px] max-h-[180px] rounded-lg object-cover mb-2 cursor-pointer" onClick={() => window.open(att.url, '_blank')} />
                    ))}
                    {msg.contentType === 'link' && msg.sourceUrl ? (
                      <a href={msg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-200 underline break-all">{msg.content}</a>
                    ) : msg.contentType === 'video' && msg.type === 'user' ? (
                      <div className="flex items-center gap-2"><Video size={16} className="text-purple-400" /><span>{msg.content}</span></div>
                    ) : msg.contentType === 'voice' ? (
                      <div className="flex items-center gap-2"><Mic size={14} className="text-orange-400" /><span>{msg.content}</span></div>
                    ) : (
                      <FormattedText text={msg.content} color={msg.type === 'user' ? '#FFFFFF' : '#D1D5DB'} fontSize={14} compact />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
            {msg.generatedImage?.imageUrl && (
              <div className="max-w-[80%] mt-2">
                <img
                  src={msg.generatedImage.imageUrl}
                  alt={msg.generatedImage.prompt}
                  loading="lazy"
                  className="w-full h-auto max-h-[60vh] object-contain rounded-xl cursor-pointer bg-gray-900/50"
                  onClick={() => window.open(msg.generatedImage!.imageUrl, '_blank')}
                />
                {msg.generatedImage.prompt && (
                  <p className="text-[10px] text-gray-500 mt-1 truncate">{msg.generatedImage.prompt}</p>
                )}
              </div>
            )}
            {msg.generatedVideo && (
              <div className="max-w-[80%] mt-2">
                {(msg.generatedVideo.status === 'queued' || msg.generatedVideo.status === 'running') && (
                  <div className="flex items-center gap-2 bg-gray-800/80 px-4 py-3 rounded-xl">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">
                      {msg.generatedVideo.status === 'queued' ? '⏳ 视频排队中...' : '🎬 视频生成中...'}
                    </span>
                  </div>
                )}
                {msg.generatedVideo.videoUrl && (
                  <video
                    src={msg.generatedVideo.videoUrl}
                    controls
                    className="w-full rounded-xl bg-gray-900/50"
                    style={{ maxHeight: '50vh' }}
                  />
                )}
                {msg.generatedVideo.status === 'failed' || msg.generatedVideo.status === 'error' ? (
                  <div className="text-sm text-red-400 bg-red-900/20 px-4 py-2 rounded-xl">
                    视频生成失败
                  </div>
                ) : null}
                {msg.generatedVideo.prompt && (
                  <p className="text-[10px] text-gray-500 mt-1 truncate">{msg.generatedVideo.prompt}</p>
                )}
              </div>
            )}
            {/* 日程预览卡片（支持多条） */}
            {msg.type === 'ai' && (msg.schedules && msg.schedules.length > 0) && (
              <div className="mt-2 ml-[52px] max-w-[85%]">
                {msg.schedules.length > 1 && (
                  <p style={{ color: '#A78BFA', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
                    识别到 {msg.schedules.length} 条日程
                  </p>
                )}
                <div className="space-y-2">
                  {msg.schedules.map((s, idx) => (
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
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addToSchedule(msg, messages)}
                  className="mt-2 w-full py-1.5 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(139,92,246,0.4)' }}
                >
                  {schedulingId === msg.id ? (
                    <>✅ 已全部添加</>
                  ) : (
                    <>📅 添加全部日程 ({msg.schedules.length}条)</>
                  )}
                </button>
              </div>
            )}

            {/* 兼容单条日程旧格式 */}
            {msg.type === 'ai' && msg.schedule && !msg.schedules && (
              <div className="mt-2 ml-[52px] max-w-[80%]">
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))',
                    border: '1px solid rgba(139,92,246,0.3)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 16 }}>📅</span>
                    <span style={{ color: '#C4B5FD', fontSize: 13, fontWeight: 600 }}>
                      {formatScheduleTime(msg.schedule.scheduled_at)}
                    </span>
                  </div>
                  <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    {msg.schedule.title}
                  </p>
                  {msg.schedule.description && (
                    <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, lineHeight: 1.4 }}>
                      {msg.schedule.description}
                    </p>
                  )}
                  {msg.schedule.location && (
                    <p style={{ color: '#6EE7B7', fontSize: 12 }}>
                      📍 {msg.schedule.location}
                    </p>
                  )}
                  {msg.schedule.suggestions && msg.schedule.suggestions.length > 0 && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(139,92,246,0.2)' }}>
                      {msg.schedule.suggestions.map((si, i) => (
                        <p key={i} style={{ color: '#A78BFA', fontSize: 11, lineHeight: 1.5 }}>
                          {i + 1}. {si}
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => addToSchedule(msg, messages)}
                    className="mt-2 w-full py-1.5 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 transition-opacity hover:opacity-80"
                    style={{ background: 'rgba(139,92,246,0.4)' }}
                  >
                    {schedulingId === msg.id ? (
                      <>✅ 已添加</>
                    ) : (
                      <>📅 添加到日程</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {hoveredMessageId === msg.id && (
              <div className={`flex mt-0.5 ${msg.type === 'user' ? 'justify-end mr-2' : 'justify-start ml-[52px]'}`}>
                {msg.type === 'user' ? (
                  <UserActions
                    msg={msg}
                    copiedId={copiedId}
                    generatingId={generatingId}
                    onCopy={copyMessage}
                    onShare={shareMessage}
                    onModify={handleModify}
                    onDelete={handleDelete}
                    onImg2Img={handleImg2Img}
                    onImg2Vid={handleImg2Vid}
                  />
                ) : (
                  <AiActions
                    msg={msg}
                    copiedId={copiedId}
                    speakingId={speakingId}
                    regeneratingId={regeneratingId}
                    savingId={savingId}
                    schedulingId={schedulingId}
                    onCopy={copyMessage}
                    onSpeak={speakMessage}
                    onShare={shareMessage}
                    onRegenerate={handleRegenerate}
                    onSave={(msg: any) => saveToInspiration(msg, messages).catch(() => showToast('保存失败，请重试', 'error'))}
                    onAddToSchedule={(msg) => addToSchedule(msg, messages)}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {isSearching && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-gray-800/80 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                <Loader2 size={14} color="white" className="animate-spin" />
              </div>
              <span className="text-gray-400 text-sm">正在联网搜索...</span>
            </div>
          </div>
        )}

        {isRewriting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-gray-800/80 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="w-7 h-7 bg-gradient-to-br from-green-500 to-teal-500 rounded-full flex items-center justify-center">
                <PenLine size={14} color="white" className="animate-pulse" />
              </div>
              <span className="text-gray-400 text-sm">正在改写...</span>
            </div>
          </div>
        )}

        {isAnalyzing && !isSearching && !isRewriting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Sparkles size={14} color="white" />
              </div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 全屏输入浮层 */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm text-gray-300">编辑内容</span>
            <button
              onClick={() => setIsFullscreen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800"
              title="缩小"
            >
              <Minimize2 size={16} color="#9CA3AF" />
            </button>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={attachedFiles.length > 0 ? "添加描述..." : "输入消息..."}
            className="flex-1 w-full p-4 bg-transparent text-white placeholder-gray-500 resize-none outline-none text-base leading-relaxed"
            autoFocus
            onPaste={async (e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (!file) continue;
                  const renamed = new File([file], `paste-${Date.now()}.png`, { type: file.type });
                  const preview = URL.createObjectURL(renamed);
                  objectUrlsRef.current.push(preview);
                  setAttachedFiles(prev => [...prev, { id: Date.now().toString(), file: renamed, preview, type: 'image' }]);
                  return;
                }
              }
            }}
          />
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <div className="flex gap-2">
              <button onClick={attachImage} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-800">
                <ImageIcon size={18} color="#9CA3AF" />
              </button>
              <button onClick={handleAnalyzeVideo} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-800">
                <Video size={18} color="#9CA3AF" />
              </button>
            </div>
            <button onClick={() => { sendMessage(); setIsFullscreen(false); }} className="px-6 py-2 bg-blue-600 rounded-full text-white text-sm flex items-center gap-2">
              <Send size={14} /> 发送
            </button>
          </div>
        </div>
      )}

      {/* 底部输入 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 px-4 py-3" style={{ maxWidth: 480, margin: '0 auto' }}>
        {isRecording ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-red-500 rounded-full flex items-center justify-center animate-pulse"><Mic size={18} color="white" /></div>
                <span className="text-red-400 font-mono">{formatTime(recordingTime)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={cancelRecording} className="px-4 py-1.5 rounded-full bg-gray-700 text-gray-300 text-sm">取消</button>
                <button onClick={handleVoiceStop} className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-sm">完成</button>
              </div>
            </div>
            {liveTranscript ? (
              <div className="px-3 py-2 bg-gray-800 rounded-xl text-gray-200 text-sm min-h-[36px]">
                {liveTranscript}
                <span className="inline-block w-1 h-4 bg-blue-400 ml-0.5 animate-pulse align-middle" />
              </div>
            ) : (
              <div className="px-3 py-2 bg-gray-800 rounded-xl text-gray-500 text-sm min-h-[36px]">
                正在聆听...
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {attachedFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {attachedFiles.map(af => (
                  <div key={af.id} className="relative flex-shrink-0">
                    <img src={af.preview} alt="" loading="lazy" className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                    <button onClick={() => removeAttachedFile(af.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center">
                      <X size={8} color="#9CA3AF" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              {/* 折叠的工具按钮 */}
              <div className="relative flex items-end pb-1">
                <button
                  onClick={() => setShowMoreTools(!showMoreTools)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
                  title="更多工具"
                >
                  <Plus size={18} color="#9CA3AF" className={showMoreTools ? 'rotate-45 transition-transform' : 'transition-transform'} />
                </button>
                {showMoreTools && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowMoreTools(false)} />
                    <div className="absolute bottom-12 left-0 z-40 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-1.5 w-44">
                      <button onClick={() => { attachImage(); setShowMoreTools(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm">
                        <ImageIcon size={16} color="#9CA3AF" /> <span className="text-gray-200">图片</span>
                      </button>
                      <button onClick={() => { handleAnalyzeVideo(); setShowMoreTools(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm">
                        <Video size={16} color="#9CA3AF" /> <span className="text-gray-200">视频</span>
                      </button>
                      <button onClick={() => { setSearchEnabled(!searchEnabled); setShowMoreTools(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm">
                        <Globe size={16} color={searchEnabled ? '#60A5FA' : '#9CA3AF'} /> <span className="text-gray-200">联网搜索</span>
                      </button>
                      <div className="border-t border-gray-700 my-1" />
                      <div className="px-3 py-1.5 text-[10px] text-gray-500">当前模型</div>
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => { setSelectedModel(opt.id); setShowMoreTools(false); }}
                          className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-gray-700 text-xs ${selectedModel === opt.id ? 'bg-purple-600/20' : ''}`}
                        >
                          <span className={selectedModel === opt.id ? 'text-purple-300' : 'text-gray-400'}>{opt.label}</span>
                          {selectedModel === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 多行时显示展开按钮 */}
              {showExpandBtn && (
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="w-7 h-9 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
                  title="全屏编辑"
                >
                  <Maximize2 size={14} color="#6B7280" />
                </button>
              )}

              <div className="flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  onPaste={async (e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) continue;
                        const renamed = new File([file], `paste-${Date.now()}.png`, { type: file.type });
                        const preview = URL.createObjectURL(renamed);
                        objectUrlsRef.current.push(preview);
                        setAttachedFiles(prev => [...prev, { id: Date.now().toString(), file: renamed, preview, type: 'image' }]);
                        return;
                      }
                    }
                  }}
                  placeholder={attachedFiles.length > 0 ? "添加描述..." : "输入消息..."}
                  className="w-full px-3.5 py-2 bg-gray-800 rounded-2xl text-white placeholder-gray-500 resize-none outline-none text-sm leading-relaxed"
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '160px' }}
                />
              </div>

              <div className="flex items-end gap-1">
                {inputText.trim().length >= 10 && (
                  <button
                    onClick={handleRewriteClick}
                    disabled={isRewriting}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 transition-colors"
                    title="改写"
                  >
                    <PenLine size={16} color={isRewriting ? '#6B7280' : '#34D399'} />
                  </button>
                )}
                {(inputText.trim() || attachedFiles.length > 0) ? (
                  <button onClick={sendMessage} className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Send size={16} color="white" />
                  </button>
                ) : (
                  <button onClick={startRecording} className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mic size={18} color="white" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 改写选择弹窗 */}
      {showRewritePicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowRewritePicker(false)} />
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-2 w-64" style={{ maxWidth: 480 }}>
            <p className="text-xs text-gray-400 px-3 py-1.5">选择改写风格</p>
            {REWRITE_STYLES.map(style => (
              <button
                key={style.key}
                onClick={() => executeRewrite(style.key)}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-gray-700 text-sm"
              >
                <span className="text-gray-200">{style.label}</span>
                <span className="text-gray-500 text-xs">{style.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function CapturePage() {
  return (
    <ProtectedRoute>
      <CaptureContent />
    </ProtectedRoute>
  );
}
