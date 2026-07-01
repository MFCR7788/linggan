'use client';

// Agent 输入栏 — 文本输入 + 语音 + 附件 + 工具栏

import { useRef } from 'react';
import { SkillRecommendCards, type SkillRecommendation } from './SkillRecommendCards';
import { CapabilityTags } from './CapabilityTags';
import { REWRITE_STYLES } from '@/lib/style-constants';
import type { AttachedFile } from '@/hooks/use-file-upload';

interface AgentInputBarProps {
  // 核心状态
  input: string;
  setInput: (val: string) => void;
  isStreaming: boolean;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  inputMode: 'voice' | 'text';
  setInputMode: React.Dispatch<React.SetStateAction<'voice' | 'text'>>;
  speechSupported: boolean;
  showTools: boolean;
  setShowTools: (show: boolean) => void;
  placeholderText: string;

  // 斜杠指令
  slashMenu: { show: boolean; filter: string; index: number; pos: number };
  setSlashMenu: React.Dispatch<React.SetStateAction<{ show: boolean; filter: string; index: number; pos: number }>>;
  filteredCommands: Array<{ command: string; label: string; desc: string; cat: string }>;

  // 语音
  pressingMic: boolean;
  cancelGesture: boolean;
  isVoiceActive: boolean;
  isTranscribing: boolean;
  liveText: string;
  speechApiSupported: boolean;
  voiceSupported: boolean;

  // 上传
  uploadError: string | null;
  setUploadError: (err: string | null) => void;
  validateFile: (file: File, type: 'image' | 'document' | 'audio') => boolean;
  createPreview: (file: File) => string;

  // 技能/改写
  dynamicRecs: SkillRecommendation[];
  recsLoading: boolean;
  showRewritePicker: boolean;
  setShowRewritePicker: (show: boolean) => void;
  isRewriting: boolean;

  // 全屏
  isFullscreen: boolean;
  setIsFullscreen: (fs: boolean) => void;
  showExpandBtn: boolean;
  setShowExpandBtn: (show: boolean) => void;

  // 操作
  handleSend: () => void;
  handleAbort: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  selectSlashCommand: (cmd: { command: string; label: string; desc: string; cat: string }) => void;
  handlePressStart: (e: React.MouseEvent | React.TouchEvent) => void;
  handlePressEnd: () => void;
  handleStopListening: () => void;
  handleRecordingMove: (e: React.MouseEvent | React.TouchEvent) => void;
  handlePickImage: () => void;
  handlePickVideo: () => void;
  handlePickDocument: () => void;
  handlePickAudio: () => void;
  handleCameraCapture: () => void;
  removeAttachedFile: (id: string) => void;
  attachAndUpload: (af: AttachedFile) => void;
  executeRewrite: (style: string) => void;

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement>;
  fileMapRef: React.MutableRefObject<Map<string, File | Blob>>;
}

export function AgentInputBar({
  input, setInput, isStreaming, attachedFiles, setAttachedFiles,
  inputMode, setInputMode, speechSupported, showTools, setShowTools,
  placeholderText,
  slashMenu, setSlashMenu, filteredCommands,
  pressingMic, cancelGesture, isVoiceActive, isTranscribing,
  liveText, speechApiSupported, voiceSupported,
  uploadError, setUploadError, validateFile, createPreview,
  dynamicRecs, recsLoading,
  showRewritePicker, setShowRewritePicker, isRewriting,
  isFullscreen, setIsFullscreen, showExpandBtn, setShowExpandBtn,
  handleSend, handleAbort, handleKeyDown, selectSlashCommand,
  handlePressStart, handlePressEnd, handleStopListening, handleRecordingMove,
  handlePickImage, handlePickVideo, handlePickDocument, handlePickAudio,
  handleCameraCapture, removeAttachedFile, attachAndUpload,
  executeRewrite, inputRef, fileMapRef,
}: AgentInputBarProps) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPastingRef = useRef(false);

  return (
    <>
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
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A1629]/95 backdrop-blur-lg border-t border-white/10 px-4 pt-2 pb-3 z-10" style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* 动态技能推荐 — 仅文字模式 */}
        {inputMode === 'text' && dynamicRecs.length > 0 && (
          <SkillRecommendCards
            recommendations={dynamicRecs}
            loading={recsLoading}
            onSelect={(skill) => { setInput(`/${skill.name} `); inputRef.current?.focus(); }}
          />
        )}
        {/* 快捷能力标签 — 仅文字模式 */}
        {inputMode === 'text' && (
          <div className="mb-2">
            <CapabilityTags onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }} />
          </div>
        )}
        <div className="relative">
        {isVoiceActive ? (
          /* ───── 录音/识别浮层 ───── */
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.85)", touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
            onMouseUp={handlePressEnd}
            onMouseMove={handleRecordingMove}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressEnd}
            onTouchMove={handleRecordingMove}
          >
            {isTranscribing ? (
              /* ───── 识别中（MediaRecorder 降级） ───── */
              <div className="flex flex-col items-center gap-8">
                <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="w-10 h-10 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-white/70 text-base">识别中...</p>
              </div>
            ) : (
              <>
                {/* 顶部取消区域 */}
                <div
                  className={`w-48 h-16 rounded-2xl flex items-center justify-center mb-8 transition-all ${
                    cancelGesture ? 'bg-red-500/30 scale-110' : 'bg-white/5'
                  }`}
                >
                  <span className={`text-sm font-medium transition-colors ${
                    cancelGesture ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {cancelGesture ? '松开 取消' : '↑ 上滑取消'}
                  </span>
                </div>

                {/* 实时识别文字 / 录音提示 */}
                <div className="max-w-sm mx-6 mb-6 text-center min-h-[3rem]">
                  {speechApiSupported ? (
                    liveText ? (
                      <p className="text-white text-lg font-medium leading-relaxed">{liveText}</p>
                    ) : (
                      <p className="text-white/40 text-base">正在聆听...</p>
                    )
                  ) : (
                    <p className="text-white/40 text-base">正在录音...</p>
                  )}
                </div>

                {/* 麦克风图标 + 波形动画 */}
                <div className="flex flex-col items-center gap-6">
                  <div
                    className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                      cancelGesture ? 'bg-red-500/40 scale-90' : 'bg-blue-500/30 scale-100'
                    }`}
                  >
                    <svg className={`w-10 h-10 transition-colors ${cancelGesture ? 'text-red-400' : 'text-blue-300'}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                      <path d="M19 11a7 7 0 01-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* 波形条 */}
                  <div className="flex items-center gap-1 h-12">
                    {[1,2,3,4,5,4,3,2,1,3,5,7,5,3,1].map((h, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all ${
                          (speechApiSupported && liveText) ? 'bg-green-400/80' : cancelGesture ? 'bg-red-400/60' : 'bg-blue-400/80'
                        }`}
                        style={{
                          height: `${h * 4}px`,
                          animation: `mic-pulse ${0.8 + (i % 5) * 0.1}s ease-in-out infinite`,
                          animationDelay: `${i * 0.05}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* 底部提示 + 停止按钮 */}
                <div className="mt-12 flex flex-col items-center gap-4">
                  <p className={`text-base font-medium transition-colors ${
                    cancelGesture ? 'text-red-400' : 'text-white/70'
                  }`}>
                    {cancelGesture ? '松手取消' : '松开 发送'}
                  </p>
                  <button
                    onClick={handleStopListening}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-white/10 hover:bg-red-500/30 flex items-center justify-center transition-colors active:scale-90"
                    title="停止并发送"
                  >
                    <svg className="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* 附件预览 */}
            {attachedFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 items-end">
                {attachedFiles.map(af => (
                  <div key={af.id} className="relative flex-shrink-0">
                    {af.uploadedUrl ? (
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center z-10">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center z-10">
                        <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
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
                      <div className="w-20 h-14 rounded-lg overflow-hidden border border-gray-700 bg-black">
                        <video
                          src={af.preview}
                          className="w-full h-full object-cover"
                          playsInline
                          muted
                          preload="metadata"
                          onMouseEnter={(e) => { try { (e.target as HTMLVideoElement).play(); } catch {} }}
                          onMouseLeave={(e) => { try { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; } catch {} }}
                          onTouchStart={(e) => {
                            const v = e.target as HTMLVideoElement;
                            if (v.paused) { try { v.play(); } catch {} } else { try { v.pause(); } catch {} }
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg className="w-4 h-4 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    ) : af.type === 'audio' ? (
                      <div className="flex items-center gap-2 px-2.5 h-14 rounded-lg border border-gray-700 bg-green-500/10 min-w-[160px]">
                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <audio
                          src={af.preview}
                          controls
                          preload="metadata"
                          className="h-8 flex-1 min-w-0"
                          style={{ maxWidth: 180 }}
                        />
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

            {/* ───── 豆包风格输入栏 ───── */}
            <div className="flex items-center gap-2">
              {/* 📷 相机按钮 */}
              <button
                onClick={handleCameraCapture}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                title="拍照"
              >
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                </svg>
              </button>

              {/* 中间：语音胶囊 / 文字输入 / 流式中止 */}
              {isStreaming ? (
                <button
                  onClick={handleAbort}
                  className="flex-1 h-11 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all active:scale-95"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#FCA5A5',
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  停止生成
                </button>
              ) : inputMode === 'voice' ? (
                <button
                  onMouseDown={handlePressStart}
                  onMouseUp={handlePressEnd}
                  onMouseMove={handleRecordingMove}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  onTouchCancel={handlePressEnd}
                  onTouchMove={handleRecordingMove}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`flex-1 h-11 rounded-full flex items-center justify-center select-none transition-all duration-200 active:scale-[0.97] ${
                    pressingMic ? 'scale-[1.02] shadow-lg shadow-red-500/30' : ''
                  }`}
                  style={{
                    background: pressingMic
                      ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                      : 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    touchAction: 'manipulation',
                  } as React.CSSProperties}
                >
                  <span
                    className="text-white text-sm font-medium tracking-wide"
                    style={{ pointerEvents: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    {pressingMic ? '松开 发送' : '按住说话'}
                  </span>
                </button>
              ) : (
                <>
                  {showExpandBtn && (
                    <button
                      onClick={() => setIsFullscreen(true)}
                      className="flex-shrink-0 w-8 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                      title="全屏编辑"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </button>
                  )}
                <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      if (isPastingRef.current) {
                        isPastingRef.current = false;
                        return;
                      }
                      const cursor = e.target.selectionStart || 0;
                      const textBefore = val.substring(0, cursor);
                      const slashMatch = textBefore.match(/(?:^|\s)\/(\S*)$/);
                      if (slashMatch) {
                        const slashPos = textBefore.lastIndexOf('/');
                        setSlashMenu({ show: true, filter: slashMatch[1], index: 0, pos: slashPos });
                      } else {
                        setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
                      }
                      // V3.4: 检测多行内容，显示展开按钮
                      setShowExpandBtn(e.target.scrollHeight > 40);
                      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                      debounceTimerRef.current = setTimeout(() => {}, 150);
                    }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (items) {
                        for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (!file) continue;
                            if (!validateFile(file, 'image')) continue;
                            const attached: AttachedFile = {
                              id: Date.now().toString() + '_' + i,
                              file,
                              preview: createPreview(file),
                              type: 'image',
                            };
                            attachAndUpload(attached);
                            return;
                          }
                        }
                      }
                      isPastingRef.current = true;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={attachedFiles.length > 0 ? '添加描述...' : placeholderText}
                    rows={1}
                    className="w-full bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none max-h-[120px] py-0.5"
                    disabled={isStreaming}
                  />
                </div>
                </>
              )}

              {/* ⌨/🎤 切换按钮 — 仅语音可用时显示 */}
              {speechSupported && (
              <button
                onClick={() => setInputMode(prev => prev === 'voice' ? 'text' : 'voice')}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                title={inputMode === 'voice' ? '切换文字输入' : '切换语音输入'}
              >
                {inputMode === 'voice' ? (
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path d="M19 11a7 7 0 01-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              )}

              {/* 📎 上传按钮 + 弹出菜单 */}
              <div className="relative">
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                  title="上传"
                >
                  <svg className={`w-5 h-5 text-gray-300 ${showTools ? 'rotate-45' : ''} transition-transform`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                {showTools && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowTools(false)} />
                    <div className="absolute bottom-12 right-0 z-40 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-1.5 w-40">
                      <button onClick={() => { setShowTools(false); handleCameraCapture(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                        </svg>
                        拍照
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickImage(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        图片
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickVideo(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        视频
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickDocument(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        文档
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickAudio(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        音频
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 改写按钮 — 输入 >= 10 字时显示 */}
              {inputMode === 'text' && !isStreaming && input.trim().length >= 10 && (
                <button
                  onClick={() => setShowRewritePicker(true)}
                  disabled={isRewriting}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-emerald-600/20 transition-colors active:scale-90"
                  title="改写"
                >
                  <svg className="w-5 h-5" fill="none" stroke={isRewriting ? '#6B7280' : '#34D399'} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}

              {/* 发送按钮 — 始终可见，有内容时高亮 */}
              {inputMode === 'text' && !isStreaming && (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && attachedFiles.length === 0}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90"
                  title="发送"
                  style={{
                    background: (input.trim() || attachedFiles.length > 0)
                      ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                      : 'transparent',
                    opacity: (input.trim() || attachedFiles.length > 0) ? 1 : 0.4,
                  }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 改写风格选择器 */}
      {showRewritePicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowRewritePicker(false)} />
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-2 w-64">
            <p className="text-xs text-gray-400 px-3 py-1.5">选择改写风格</p>
            {REWRITE_STYLES.map(style => (
              <button
                key={style.key}
                onClick={() => executeRewrite(style.key)}
                disabled={isRewriting}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm"
              >
                <span className="text-gray-200">{style.label}</span>
                <span className="text-gray-500 text-xs">{style.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 全屏输入浮层 */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
            <span className="text-sm text-gray-300">编辑内容</span>
            <button
              onClick={() => setIsFullscreen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800"
              title="缩小"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={attachedFiles.length > 0 ? '添加描述...' : placeholderText}
            className="flex-1 w-full p-4 bg-transparent text-white placeholder-white/30 resize-none outline-none text-base leading-relaxed"
            autoFocus
            onPaste={async (e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (!file || !validateFile(file, 'image')) continue;
                  const attached: AttachedFile = {
                    id: Date.now().toString(),
                    file,
                    preview: createPreview(file),
                    type: 'image',
                  };
                  attachAndUpload(attached);
                  return;
                }
              }
            }}
          />
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <div className="flex gap-2">
              <button onClick={handleCameraCapture} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-800">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                </svg>
              </button>
            </div>
            <button
              onClick={() => { handleSend(); setIsFullscreen(false); }}
              className="px-6 py-2 bg-blue-600 rounded-full text-white text-sm flex items-center gap-2"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
