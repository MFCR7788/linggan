import { NextRequest, NextResponse } from 'next/server';
import { callDoubaoChat } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { content, style } = await request.json();

    if (!content || content.length < 10) {
      return NextResponse.json({ success: false, error: '内容太短，无法改写' }, { status: 400 });
    }

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_rewrite', 'AI 改写', { style, contentLen: content.length });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} credits,当前 ${e.available} credits`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const styleMap: Record<string, string> = {
      concise: '简洁精炼，去掉冗余表达，保留核心信息，语言简练有力',
      detailed: '详细丰富，在原内容基础上扩充细节和例证，让内容更充实',
      casual: '更口语化，用日常对话的口吻，亲切自然，像朋友聊天',
      formal: '更正式，用书面语表达，措辞严谨规范，适合正式场合',
      xiaohongshu: '小红书风格，用热情亲切的语气，加emoji表情，分段清晰，有吸引力',
    };

    const styleDesc = styleMap[style] || styleMap.casual;

    const messages = [{
      role: 'user' as const,
      content: `请帮我改写以下内容。要求：${styleDesc}

原文：
${content}

请直接输出改写后的结果，不要加其他说明和JSON。`
    }];

    const response = await callDoubaoChat(messages, {
      temperature: 0.8,
      maxTokens: 2000,
    });

    return NextResponse.json({
      success: true,
      response: response.trim(),
    });

  } catch (error) {
    console.error('改写 API 错误:', error);
    return NextResponse.json({ success: false, error: '改写失败' }, { status: 500 });
  }
});
