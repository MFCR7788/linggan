'use client';

// Agent 聊天主容器 — 流式消息列表 + 输入框 + 语音 + 附件

import { useState, useRef, useEffect, useCallback } from 'react';
import { AgentMessage } from './AgentMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import { useVoiceRecording, formatTime } from '@/hooks/use-voice-recording';
import { useFileUpload } from '@/hooks/use-file-upload';
import type { AttachedFile } from '@/hooks/use-file-upload';
import type { AgentEvent } from '@/lib/agent/types';

interface UIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallRecord[];
  attachments?: { url: string; name: string; type: 'image' | 'document' }[];
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

  // 语音录制
  const voice = useVoiceRecording();
  const { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording } = voice;

  // 文件上传
  const fileUpload = useFileUpload();
  const { uploadError, setUploadError, uploadFile, pickImage, pickDocument, revokePreview } = fileUpload;

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

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    const hasFiles = attachedFiles.length > 0;
    if ((!trimmed && !hasFiles) || isStreaming) return;

    // 上传附件
    const uploadedImages: string[] = [];
    const uploadedDocs: string[] = [];
    const attachmentInfo: { url: string; name: string; type: 'image' | 'document' }[] = [];

    for (const af of attachedFiles) {
      const url = await uploadFile(af.file);
      if (url) {
        attachmentInfo.push({ url, name: af.file.name, type: af.type });
        if (af.type === 'image') {
          uploadedImages.push(url);
        } else {
          uploadedDocs.push(url);
        }
      }
      if (af.type === 'image') revokePreview(af.preview);
    }

    let displayContent = trimmed;
    if (!displayContent && uploadedDocs.length > 0) {
      displayContent = `请分析这份文档：${attachedFiles.filter(f => f.type === 'document').map(f => f.file.name).join('、')}`;
    }
    if (!displayContent && uploadedImages.length > 0) {
      displayContent = `请分析这${uploadedImages.length}张图片`;
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
  }, [input, isStreaming, attachedFiles, uploadFile, revokePreview]);

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

  const handlePressEnd = async (e: React.PointerEvent | React.TouchEvent) => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    if (pressHandledRef.current) return;
    pressHandledRef.current = true;

    const transcript = await stopRecording();
    if (transcript) {
      setInput(prev => (prev ? prev + transcript : transcript));
    }
  };

  const handleAttachImage = async () => {
    setShowTools(false);
    const file = await pickImage();
    if (file) setAttachedFiles(prev => [...prev, file]);
  };

  const handleAttachDocument = async () => {
    setShowTools(false);
    const file = await pickDocument();
    if (file) setAttachedFiles(prev => [...prev, file]);
  };

  const removeAttachedFile = (id: string) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.type === 'image') revokePreview(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center px-4 py-3 border-b border-white/10">
        <h1 className="text-lg font-semibold text-white">对话助手</h1>
      </div>

      {/* 消息列表 — pb-32 给固定输入框留空间 */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1 pb-32">
        {messages.length === 0 && (
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
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A1629]/95 backdrop-blur-lg border-t border-white/10 px-4 py-3" style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* 语音录制中 */}
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
                <button
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-400 border border-white/10"
                >
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
                      <button onClick={handleAttachImage} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        图片
                      </button>
                      <button onClick={handleAttachDocument} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
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
                  onChange={(e) => setInput(e.target.value)}
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
