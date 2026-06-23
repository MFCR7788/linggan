'use client';

// 提示词质量反馈 — 👍👎 常显按钮 + 标签选择 + 评论 + 灵力奖励

import { useState, useCallback, useMemo } from 'react';

interface PromptFeedbackProps {
  messageId?: string;
  sessionId?: string;
  originalPrompt?: string;
  optimizedPrompt?: string;
  optimization?: {
    original: string;
    framework: string;
    confidence: number;
  };
  toolCalls?: string[];
  responseSnippet?: string;
  showReminder?: boolean;
  onFeedbackGiven?: () => void;
}

const FEEDBACK_TAGS = [
  '理解准确', '理解偏差',
  '风格合适', '风格不符',
  '细节丰富', '过于简略',
  '创意感强', '缺乏新意',
  '可直接使用', '需二次修改',
];

const DONE_MESSAGES = [
  '收到！已记住你的偏好 🧠',
  '已记录，下次更懂你 ✨',
  '感谢反馈，越用越聪明了 🤖',
  '收到，我会更努力的 💪',
  '+1 💎 谢谢你的反馈',
  '已存下，偏好已更新 📝',
  '好嘞，学到了！⚡',
  '感谢助力灵集进化 🚀',
];

export function PromptFeedback({
  messageId,
  sessionId,
  originalPrompt,
  optimizedPrompt,
  optimization,
  toolCalls,
  responseSnippet,
  showReminder = false,
  onFeedbackGiven,
}: PromptFeedbackProps) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const doneMessage = useMemo(() =>
    DONE_MESSAGES[Math.floor(Math.random() * DONE_MESSAGES.length)],
  []);

  const handleRate = useCallback(async (r: 1 | -1) => {
    setRating(r);

    if (r === -1) {
      setExpanded(true);
      return;
    }

    // 点赞直接提交
    setSubmitting(true);
    try {
      const res = await fetch('/api/ai/prompt-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || null,
          message_id: messageId || null,
          original_prompt: originalPrompt || optimization?.original || '',
          optimized_prompt: optimizedPrompt || null,
          framework_used: optimization?.framework || null,
          optimization_confidence: optimization?.confidence ?? null,
          rating: 1,
          feedback_tags: [],
          comment: null,
          tool_calls_used: toolCalls || null,
          response_snippet: responseSnippet || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        onFeedbackGiven?.();
      }
    } catch { /* 静默失败 */ }
    setSubmitting(false);
  }, [sessionId, messageId, originalPrompt, optimizedPrompt, optimization, toolCalls, responseSnippet, onFeedbackGiven]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitDetail = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/ai/prompt-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || null,
          message_id: messageId || null,
          original_prompt: originalPrompt || optimization?.original || '',
          optimized_prompt: optimizedPrompt || null,
          framework_used: optimization?.framework || null,
          optimization_confidence: optimization?.confidence ?? null,
          rating,
          feedback_tags: selectedTags.length > 0 ? selectedTags : null,
          comment: comment.trim() || null,
          tool_calls_used: toolCalls || null,
          response_snippet: responseSnippet || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setExpanded(false);
        onFeedbackGiven?.();
      }
    } catch { /* 静默失败 */ }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1.5 mt-2 text-xs text-green-400/70">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>{doneMessage}</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* 常显评价行 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/25 select-none">
          {showReminder ? '💡 有帮助吗？' : '有帮助吗？'}
        </span>
        <button
          onClick={() => handleRate(1)}
          disabled={submitting}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all ${
            rating === 1
              ? 'bg-green-500/15 text-green-400'
              : 'bg-white/5 text-white/35 hover:bg-green-500/10 hover:text-green-400 border border-transparent hover:border-green-500/20'
          }`}
          title="有帮助，送 1 💎"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
          <span className="text-[10px] opacity-60">+1💎</span>
        </button>
        <button
          onClick={() => handleRate(-1)}
          disabled={submitting}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all ${
            rating === -1
              ? 'bg-red-500/15 text-red-400'
              : 'bg-white/5 text-white/35 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20'
          }`}
          title="不满意"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
        </button>

        {optimization && (
          <span className="text-[10px] text-white/15 ml-auto">{optimization.framework}</span>
        )}
      </div>

      {/* 展开标签选择 + 评论（点踩时自动展开） */}
      {expanded && rating !== null && (
        <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
          <div className="flex flex-wrap gap-1 mb-2">
            {FEEDBACK_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded-full text-[10px] transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="补充说明（可选）..."
              maxLength={500}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 placeholder-white/20 outline-none focus:border-blue-500/30"
            />
            <button
              onClick={handleSubmitDetail}
              disabled={submitting}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-blue-500/30 hover:bg-blue-500/50 transition-colors disabled:opacity-40"
            >
              {submitting ? '...' : '提交'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
