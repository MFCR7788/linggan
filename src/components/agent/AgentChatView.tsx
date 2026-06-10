'use client';

// Agent 聊天主容器 — 会话管理 + 流式消息 + 语音 + 附件 + 媒体预览

import { useState, useRef, useEffect, useCallback } from 'react';
import { useInputHistory } from '@/hooks/use-input-history';
import { AgentMessage } from './AgentMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import { useVoiceRecording, formatTime } from '@/hooks/use-voice-recording';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useAgentSessions } from '@/hooks/use-agent-sessions';
import type { AttachedFile } from '@/hooks/use-file-upload';
import type { AgentSession } from '@/hooks/use-agent-sessions';

interface UIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallRecord[];
  attachments?: { url: string; name: string; type: 'image' | 'video' | 'document' }[];
  generatedImages?: string[];
  generatedVideo?: { taskId: string; status: string; videoUrl?: string };
  generatedAudio?: string;
  timestamp: Date;
}

interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; data?: unknown; error?: string };
}

export function AgentChatView() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTool, setCurrentTool] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showTools, setShowTools] = useState(false);
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
          const uiMsgs: UIMessage[] = msgs.map((m: any) => ({
            id: m.id,
            type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
            toolCalls: [],
            attachments: m.attachments || undefined,
            timestamp: new Date(m.created_at),
          }));
          setMessages(uiMsgs);
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setAttachedFiles([]);
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
                }

                return { ...m, toolCalls, generatedImages, generatedAudio, generatedVideo };
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
  }, [input, isStreaming, attachedFiles, currentSessionId, uploadFile, revokePreview, createSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  // 会话操作
  const handleSwitchSession = (session: AgentSession) => {
    switchSession(session.id);
    loadMessages(session.id).then(msgs => {
      const uiMsgs: UIMessage[] = msgs.map((m: any) => ({
        id: m.id,
        type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
        toolCalls: [],
        attachments: m.attachments || undefined,
        timestamp: new Date(m.created_at),
      }));
      setMessages(uiMsgs);
    });
  };

  const handleNewSession = () => {
    createSession();
    setMessages([]);
    setShowSessionList(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
    if (currentSessionId === sessionId) setMessages([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 — 会话选择器 */}
      <div className="relative flex items-center px-4 py-3 border-b border-white/10">
        <button
          onClick={() => setShowSessionList(!showSessionList)}
          className="flex items-center gap-1.5 max-w-[200px]"
        >
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate text-sm text-white">
            {currentSessionId
              ? sessions.find(s => s.id === currentSessionId)?.title || '对话助手'
              : '对话助手'}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          onClick={handleNewSession}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
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
            <div className="absolute top-12 left-3 z-30 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-72 overflow-y-auto">
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
                  onClick={() => handleSwitchSession(s)}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-700/50 text-sm ${s.id === currentSessionId ? 'bg-gray-700/30 text-white' : 'text-gray-400'}`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="truncate flex-1">{s.title}</span>
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
        {messages.length === 0 && !isLoadingSessions && (
          <div className="flex flex-col items-center justify-center h-full text-white/30 px-8 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-sm mb-2">跟我说说你想创作什么吧</p>
            <p className="text-xs">我会引导你完成创作，也能直接搜索、生图、查天气</p>
          </div>
        )}

        {messages.map((msg) => (
          <AgentMessage
            key={msg.id}
            type={msg.type}
            content={msg.content}
            toolCalls={msg.toolCalls.length > 0 ? msg.toolCalls : undefined}
            attachments={msg.attachments}
            generatedImages={msg.generatedImages}
            generatedVideo={msg.generatedVideo}
            generatedAudio={msg.generatedAudio}
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
                    setInput(e.target.value);
                    // 粘贴后跳过实时校验，延迟重置标记
                    if (isPastingRef.current) {
                      isPastingRef.current = false;
                      return;
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
  );
}
