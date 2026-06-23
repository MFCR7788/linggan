'use client';

// 提示词质量反馈 — 👍👎 按钮 + 标签选择 + 评论

import { useState, useCallback } from 'react';

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
}

const FEEDBACK_TAGS = [
  '理解准确', '理解偏差',
  '风格合适', '风格不符',
  '细节丰富', '过于简略',
  '创意感强', '缺乏新意',
  '可直接使用', '需二次修改',
];

export function PromptFeedback({
  messageId,
  sessionId,
  originalPrompt,
  optimizedPrompt,
  optimization,
  toolCalls,
  responseSnippet,
}: PromptFeedbackProps) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleRate = useCallback(async (r: 1 | -1) => {
    setRating(r);
    setExpanded(true);

    // 如果直接点踩，自动展开标签选择
    if (r === -1) {
      setExpanded(true);
    }

    // 点赞直接提交（不展开标签）
    if (r === 1) {
      setSubmitting(true);
      try {
        await fetch('/api/ai/prompt-feedback', {
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
        setSubmitted(true);
      } catch { /* 静默失败 */ }
      setSubmitting(false);
    }
  }, [sessionId, messageId, originalPrompt, optimizedPrompt, optimization, toolCalls, responseSnippet]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitDetail = async () => {
    setSubmitting(true);
    try {
      await fetch('/api/ai/prompt-feedback', {
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
      setSubmitted(true);
      setExpanded(false);
    } catch { /* 静默失败 */ }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1 mt-1.5 text-xs text-green-400/80">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        感谢反馈
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      {/* 评价按钮行 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleRate(1)}
          disabled={submitting}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${
            rating === 1
              ? 'bg-green-500/20 text-green-400'
              : 'hover:bg-white/10 text-white/30 hover:text-green-400'
          }`}
          title="回答有帮助"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
          </svg>
        </button>
        <button
          onClick={() => handleRate(-1)}
          disabled={submitting}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${
            rating === -1
              ? 'bg-red-500/20 text-red-400'
              : 'hover:bg-white/10 text-white/30 hover:text-red-400'
          }`}
          title="回答没有帮助"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
        </button>

        {/* 框架信息标识 */}
        {optimization && (
          <span className="text-[10px] text-white/20 ml-1">
            {optimization.framework}
          </span>
        )}
      </div>

      {/* 展开标签选择 + 评论（点踩或主动展开时显示） */}
      {expanded && rating !== null && (
        <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/10">
          {/* 标签选择 */}
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

          {/* 评论输入 */}
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
