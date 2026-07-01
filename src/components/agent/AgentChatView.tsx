'use client';

// Agent 聊天主容器 — 会话管理 + 顶层布局 + 子组件组合

import { AgentMessageBubble } from './AgentMessageBubble';
import { AgentInputBar } from './AgentInputBar';
import { AgentSuggestionPanel } from './AgentSuggestionPanel';
import { AgentSessionList } from './AgentSessionList';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ChoiceCards } from './ChoiceCards';
import { InspirationPicker } from './InspirationPicker';
import { ParamCard } from './ParamCard';
import { parseChoices } from '@/lib/agent/choice-parser';
import { parseParamCards } from '@/lib/agent/param-parser';
import { useAgentChat, type UIMessage } from '@/hooks/useAgentChat';

export type { UIMessage };

export function AgentChatView() {
  const chat = useAgentChat();

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 — 返回 + 会话选择器 + 新建（fixed，与 TopNavBar 同级贴顶） */}
      <div
        className="fixed top-0 left-0 right-0 z-40"
        style={{
          background: "rgba(10, 22, 41, 0.97)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="relative flex items-center px-4 pb-3 border-b border-white/10 max-w-[448px] md:max-w-[720px] lg:max-w-[1024px] mx-auto" style={{ paddingTop: "calc(0.25rem + env(safe-area-inset-top))" }}>
        {/* 返回按钮 */}
        <button
          onClick={() => chat.router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 会话选择器 — 居中 */}
        <div className="flex-1 flex justify-center items-center gap-1.5">
          <button
            onClick={() => chat.setShowSessionList(!chat.showSessionList)}
            className="flex items-center gap-1.5 max-w-[180px]"
          >
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {chat.currentSessionId && chat.editingTitle === chat.currentSessionId ? (
              <input
                autoFocus
                value={chat.editTitleValue}
                onChange={(e) => chat.setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') chat.saveEditTitle();
                  if (e.key === 'Escape') chat.setEditingTitle(null);
                }}
                onBlur={chat.saveEditTitle}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-700 text-white text-sm rounded px-1.5 py-0.5 outline-none max-w-[120px]"
              />
            ) : (
              <span className="truncate text-sm text-white">
                {chat.currentSessionId
                  ? chat.sessions.find(s => s.id === chat.currentSessionId)?.title || '对话助手'
                  : '对话助手'}
              </span>
            )}
            <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* 铅笔编辑按钮 */}
          {chat.currentSessionId && chat.editingTitle !== chat.currentSessionId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const sid = chat.currentSessionId;
                const title = chat.sessions.find(s => s.id === sid)?.title || '对话助手';
                if (sid) chat.startEditTitle(sid, title);
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 flex-shrink-0"
              title="修改名称"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>

        {/* 新建对话 */}
        <button
          onClick={chat.handleNewSession}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title="新建对话"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
          </svg>
        </button>

        {/* 会话列表下拉 */}
        {chat.showSessionList && (
          <AgentSessionList
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            editingTitle={chat.editingTitle}
            editTitleValue={chat.editTitleValue}
            isLoading={chat.isLoadingSessions}
            setEditTitleValue={chat.setEditTitleValue}
            setEditingTitle={chat.setEditingTitle}
            onSwitchSession={chat.handleSwitchSession}
            onNewSession={chat.handleNewSession}
            onDeleteSession={chat.handleDeleteSession}
            onTogglePin={chat.handleTogglePin}
            onStartEditTitle={chat.startEditTitle}
            onSaveEditTitle={chat.saveEditTitle}
            onClose={() => chat.setShowSessionList(false)}
          />
        )}
        </div>
      </div>

      {/* 流程引导头部 — 始终可见（非滚动区域） */}
      {chat.activeFlow && chat.messages.length > 0 && (
        <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{chat.activeFlow.combo.emoji}</span>
            <span className="text-sm font-semibold text-white">{chat.activeFlow.combo.title}</span>
            <span className="text-[10px] text-gray-500">第 {chat.activeFlow.currentStep + 1}/{chat.activeFlow.combo.steps.length} 步</span>
            <button
              onClick={() => chat.clearActiveFlow()}
              className="ml-auto w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
              title="删除流程"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {chat.activeFlow.combo.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                {i > 0 && <div className="flex-1 h-px bg-white/10 min-w-[8px]" />}
                <button
                  onClick={() => chat.handleJumpToStep(i)}
                  className={`flex flex-col items-center gap-0.5 transition-all hover:opacity-80 active:scale-95 cursor-pointer ${
                    i === chat.activeFlow!.currentStep ? 'text-blue-300' :
                    i < chat.activeFlow!.currentStep ? 'text-green-300/60' :
                    'text-gray-600'
                  }`}
                  title={`${step.label} — 点击跳转到此步骤`}
                >
                  <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    i === chat.activeFlow!.currentStep ? 'bg-blue-500 text-white' :
                    i < chat.activeFlow!.currentStep ? 'bg-green-500/20 text-green-300' :
                    'bg-white/5 text-gray-500'
                  }`}>
                    {i < chat.activeFlow!.currentStep ? '✓' : i + 1}
                  </span>
                  <span className="text-[8px] text-center leading-tight max-w-[44px] truncate">{step.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 — fixed header/footer 留空间 */}
      <div
        ref={chat.scrollContainerRef}
        className="flex-1 overflow-y-auto py-4 space-y-1"
        style={{
          paddingTop: 52,
          paddingBottom: 'calc(220px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {chat.messages.length === 0 && !chat.isLoadingSessions && !chat.isLoadingMessages && (
          <AgentSuggestionPanel
            selectedAccountType={chat.selectedAccountType}
            setSelectedAccountType={chat.setSelectedAccountType}
            accountSearch={chat.accountSearch}
            setAccountSearch={chat.setAccountSearch}
            onStartCombo={chat.handleStartCombo}
          />
        )}

        {/* 加载消息中 */}
        {chat.isLoadingMessages && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-sm text-gray-400">加载消息中...</span>
          </div>
        )}

        {/* 计划进度条 */}
        {chat.planProgress && (
          <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-blue-400">目标</span>
              <span className="text-sm text-white/80">{chat.planProgress.goal}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${chat.planProgress.totalSteps > 0 ? (chat.planProgress.completedSteps / chat.planProgress.totalSteps) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {chat.planProgress.completedSteps}/{chat.planProgress.totalSteps}
              </span>
            </div>
            {chat.planProgress.currentStep && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                当前: {chat.planProgress.currentStep}
              </div>
            )}
          </div>
        )}

        {chat.messages.map((msg) => (
          <AgentMessageBubble
            key={msg.id}
            msg={msg}
            scheduledItems={chat.scheduledItems}
            schedulingId={chat.schedulingId}
            consecutiveNoFeedback={chat.consecutiveNoFeedback}
            currentSessionId={chat.currentSessionId}
            copiedId={chat.copiedId}
            regeneratingId={chat.regeneratingId}
            fileMapRef={chat.fileMapRef}
            onAddSchedule={chat.addToSchedule}
            onCopy={chat.handleCopy}
            onModify={chat.handleModify}
            onRegenerate={chat.handleRegenerate}
            onDelete={chat.handleDelete}
            onSaveToInspiration={chat.handleSaveToInspiration}
            onSpeak={chat.handleSpeak}
            onShare={chat.handleShare}
            onFeedbackGiven={chat.handleFeedbackGiven}
          />
        ))}

        {/* 交互式选项卡片 — 最后一条 assistant 消息包含 choices 时显示 */}
        {(() => {
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (!lastMsg || lastMsg.type !== 'assistant' || chat.isStreaming) return null;
          const { choices } = parseChoices(lastMsg.content);
          if (choices.length === 0) return null;

          const hasAnySelection = Array.from(chat.choiceSelections.values()).some(
            s => s.options.length > 0 || s.customInput.trim()
          );

          return (
            <div className="px-4">
              {choices.map((block, i) => (
                <ChoiceCards
                  key={i}
                  block={block}
                  onChange={(sel) => {
                    chat.setChoiceSelections(prev => {
                      const next = new Map(prev);
                      next.set(i, sel);
                      return next;
                    });
                  }}
                  onPickLocal={block.type ? () => chat.handlePickLocalMedia(block.type!) : undefined}
                  onPickInspiration={block.type ? () => chat.handlePickInspirationMedia(block.type!) : undefined}
                />
              ))}

              {/* 统一发送选择按钮 — 最下方 */}
              <button
                onClick={chat.handleChoiceSubmit}
                disabled={!hasAnySelection || chat.choiceSubmitting}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: hasAnySelection
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  color: hasAnySelection ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  opacity: chat.choiceSubmitting ? 0.6 : 1,
                  cursor: hasAnySelection ? 'pointer' : 'default',
                }}
              >
                {chat.choiceSubmitting ? (
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

        {/* ParamCard — 结构化参数选择（滑块/开关/下拉），与 <choices> 并存 */}
        {(() => {
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (!lastMsg || lastMsg.type !== 'assistant' || chat.isStreaming) return null;
          const { cards } = parseParamCards(lastMsg.content);
          if (cards.length === 0) return null;

          const hasParamValues = Array.from(chat.paramValues.values()).some(
            v => Object.keys(v).length > 0
          );

          return (
            <div className="px-4 space-y-3 mt-3">
              {cards.map((schema, i) => (
                <ParamCard
                  key={i}
                  schema={schema}
                  onChange={(values) => {
                    chat.setParamValues(prev => {
                      const next = new Map(prev);
                      next.set(i, values);
                      return next;
                    });
                  }}
                />
              ))}

              <button
                onClick={chat.handleParamSubmit}
                disabled={!hasParamValues || chat.paramSubmitting}
                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: hasParamValues
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  color: hasParamValues ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  opacity: chat.paramSubmitting ? 0.6 : 1,
                  cursor: hasParamValues ? 'pointer' : 'default',
                }}
              >
                {chat.paramSubmitting ? (
                  <>处理中...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    确认参数，开始生成
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {/* 思考指示器 */}
        {chat.isStreaming && (chat.statusText === 'executing' || chat.statusText === 'thinking' || chat.statusText) && (
          <ThinkingIndicator
            status={chat.statusText === 'executing' ? 'executing' : 'thinking'}
            toolName={chat.currentTool}
            message={chat.statusText === 'executing' || chat.statusText === 'thinking' ? undefined : chat.statusText}
          />
        )}

        <div ref={chat.messagesEndRef} />
      </div>

      {/* 引导语 — 欢迎状态下底部显示 */}
      {chat.messages.length === 0 && (
        <div className="fixed bottom-[calc(110px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-10" style={{ maxWidth: 480, margin: '0 auto' }}>
          <p className="text-center text-sm text-blue-300 px-4">
            今天你有什么灵感，发送给我！
          </p>
        </div>
      )}

      {/* 输入栏 */}
      <AgentInputBar
        input={chat.input}
        setInput={chat.setInput}
        isStreaming={chat.isStreaming}
        attachedFiles={chat.attachedFiles}
        setAttachedFiles={chat.setAttachedFiles}
        inputMode={chat.inputMode}
        setInputMode={chat.setInputMode}
        speechSupported={chat.speechSupported}
        showTools={chat.showTools}
        setShowTools={chat.setShowTools}
        placeholderText={chat.placeholderText}
        slashMenu={chat.slashMenu}
        setSlashMenu={chat.setSlashMenu}
        filteredCommands={chat.filteredCommands}
        pressingMic={chat.pressingMic}
        cancelGesture={chat.cancelGesture}
        isVoiceActive={chat.isVoiceActive}
        isTranscribing={chat.isTranscribing}
        liveText={chat.liveText}
        speechApiSupported={chat.speechApiSupported}
        voiceSupported={chat.voiceSupported}
        uploadError={chat.uploadError}
        setUploadError={chat.setUploadError}
        validateFile={chat.validateFile}
        createPreview={chat.createPreview}
        dynamicRecs={chat.dynamicRecs}
        recsLoading={chat.recsLoading}
        showRewritePicker={chat.showRewritePicker}
        setShowRewritePicker={chat.setShowRewritePicker}
        isRewriting={chat.isRewriting}
        isFullscreen={chat.isFullscreen}
        setIsFullscreen={chat.setIsFullscreen}
        showExpandBtn={chat.showExpandBtn}
        setShowExpandBtn={chat.setShowExpandBtn}
        handleSend={chat.handleSend}
        handleAbort={chat.handleAbort}
        handleKeyDown={chat.handleKeyDown}
        selectSlashCommand={chat.selectSlashCommand}
        handlePressStart={chat.handlePressStart}
        handlePressEnd={chat.handlePressEnd}
        handleStopListening={chat.handleStopListening}
        handleRecordingMove={chat.handleRecordingMove}
        handlePickImage={chat.handlePickImage}
        handlePickVideo={chat.handlePickVideo}
        handlePickDocument={chat.handlePickDocument}
        handlePickAudio={chat.handlePickAudio}
        handleCameraCapture={chat.handleCameraCapture}
        removeAttachedFile={chat.removeAttachedFile}
        attachAndUpload={chat.attachAndUpload}
        executeRewrite={chat.executeRewrite}
        inputRef={chat.inputRef}
        fileMapRef={chat.fileMapRef}
      />

    {/* 灵感库素材选择弹窗 */}
    <InspirationPicker
      open={chat.inspPickerOpen}
      onClose={() => chat.setInspPickerOpen(false)}
      onSelect={chat.handleInspirationSelect}
      mediaType={chat.inspPickerMediaType}
    />

    {/* V3-3: 扣点确认弹窗 */}
    {chat.creditConfirm && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => chat.setCreditConfirm(null)}>
        <div
          className="w-full max-w-[480px] rounded-t-2xl p-6 pb-8"
          style={{ background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(20px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-white mb-2">确认操作</h3>
          <p className="text-sm text-gray-300 mb-4">
            你即将使用 <span className="text-blue-400 font-medium">{chat.creditConfirm.label}</span>
            ，预计消耗 <span className="text-amber-400 font-medium">{chat.creditConfirm.cost} 灵力</span>
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => chat.setCreditConfirm(null)}
              className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => chat.pendingSendRef.current()}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white transition-colors"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
            >
              确认生成 ({chat.creditConfirm.cost} 💎)
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
