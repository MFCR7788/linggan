// POST /api/ai/prompt-feedback — 收集提示词质量反馈

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { savePromptFeedback } from '@/lib/agent/prompt-optimizer/feedback-store';

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const {
    session_id,
    message_id,
    original_prompt,
    optimized_prompt,
    framework_used,
    optimization_confidence,
    rating,
    feedback_tags,
    comment,
    tool_calls_used,
    response_snippet,
  } = body;

  if (!original_prompt || !rating || ![-1, 1].includes(rating)) {
    return NextResponse.json({ success: false, error: '缺少必要字段（original_prompt, rating）' }, { status: 400 });
  }

  if (comment && typeof comment === 'string' && comment.length > 500) {
    return NextResponse.json({ success: false, error: '评论内容过长（最大 500 字符）' }, { status: 400 });
  }

  const id = await savePromptFeedback({
    userId: user.id,
    sessionId: session_id,
    messageId: message_id,
    originalPrompt: original_prompt,
    optimizedPrompt: optimized_prompt,
    frameworkUsed: framework_used,
    optimizationConfidence: optimization_confidence,
    rating,
    feedbackTags: feedback_tags,
    comment,
    toolCallsUsed: tool_calls_used,
    responseSnippet: response_snippet,
  });

  if (!id) {
    return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { id } });
});
