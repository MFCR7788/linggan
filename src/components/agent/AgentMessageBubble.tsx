'use client';

// Agent 消息气泡包装器 — 清理 choices 标签 + 渲染 AgentMessage + EditPlanCard

import { AgentMessage } from './AgentMessage';
import { EditPlanCard } from './EditPlanCard';
import { parseChoices } from '@/lib/agent/choice-parser';
import type { UIMessage } from '@/hooks/useAgentChat';

interface AgentMessageBubbleProps {
  msg: UIMessage;
  scheduledItems: Set<string>;
  schedulingId: string | null;
  consecutiveNoFeedback: number;
  currentSessionId: string | null;
  copiedId: string | null;
  regeneratingId: string | null;
  fileMapRef: React.MutableRefObject<Map<string, File | Blob>>;
  onAddSchedule: (msg: UIMessage, scheduleIndex?: number, editedData?: { title: string; scheduled_at: string; description?: string; location?: string }) => void;
  onCopy: (msg: UIMessage) => void;
  onModify: (msg: UIMessage) => void;
  onRegenerate: (msg: UIMessage) => void;
  onDelete: (msg: UIMessage) => void;
  onSaveToInspiration: (msg: UIMessage) => void;
  onSpeak: (msg: UIMessage) => void;
  onShare: (msg: UIMessage) => void;
  onFeedbackGiven: () => void;
}

export function AgentMessageBubble({
  msg, scheduledItems, schedulingId, consecutiveNoFeedback,
  currentSessionId, copiedId, regeneratingId, fileMapRef,
  onAddSchedule, onCopy, onModify, onRegenerate, onDelete,
  onSaveToInspiration, onSpeak, onShare, onFeedbackGiven,
}: AgentMessageBubbleProps) {
  // 对 assistant 消息，清理 choices 标签，避免显示原始 XML
  const cleaned = msg.type === 'assistant' ? parseChoices(msg.content).cleanedText : msg.content;
  const displayContent = cleaned || msg.content;

  return (
    <div key={msg.id}>
      <AgentMessage
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
        onAddSchedule={(idx, edited) => onAddSchedule(msg, idx, edited)}
        onAddAllSchedules={() => onAddSchedule(msg)}
        messageId={msg.id}
        sessionId={currentSessionId || undefined}
        optimization={msg.optimization}
        showFeedbackReminder={msg.type === 'assistant' && consecutiveNoFeedback >= 3}
        onFeedbackGiven={msg.type === 'assistant' ? onFeedbackGiven : undefined}
        timestamp={msg.timestamp}
        onCopy={() => onCopy(msg)}
        onModify={() => onModify(msg)}
        onRegenerate={msg.type === 'assistant' ? () => onRegenerate(msg) : undefined}
        onDelete={() => onDelete(msg)}
        onSaveToInspiration={msg.type === 'assistant' ? () => onSaveToInspiration(msg) : undefined}
        onSpeak={msg.type === 'assistant' ? () => onSpeak(msg) : undefined}
        onShare={msg.type === 'assistant' ? () => onShare(msg) : undefined}
        isCopied={copiedId === msg.id || copiedId === 'saved_' + msg.id || copiedId === 'shared_' + msg.id}
        isRegenerating={regeneratingId === msg.id}
      />
      {msg.editPlan && (
        <div className="px-4">
          <EditPlanCard
            plan={msg.editPlan}
            fileMap={fileMapRef.current}
            onDownload={(blob, name) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = name;
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        </div>
      )}
    </div>
  );
}
