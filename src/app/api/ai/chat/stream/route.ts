import { NextRequest, NextResponse } from 'next/server';
import { callDeepSeekStream } from '@/lib/ai-services';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export const POST = withAuth(async ({ request, user }) => {
  const body = await request.json();
  const { content = '', searchResults } = body;

  if (!content) {
    return NextResponse.json({ error: '内容不能为空' }, { status: 400 }) as NextResponse;
  }

  // 扣点
  const creditCost = CREDIT_COSTS.ai_text.perCall;
  try {
    await consume(user.id, creditCost, 'ai_chat_stream', 'AI 对话（流式）', { contentLen: content.length });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: `余额不足:需要 ${creditCost} 灵力`, code: 'INSUFFICIENT_CREDITS' },
        { status: 402 }
      ) as NextResponse;
    }
    throw e;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data:${JSON.stringify(data)}\n\n`));
      };

      try {
        let prompt = content;
        if (searchResults?.length > 0) {
          const searchContext = searchResults.map((r: { title: string; url: string; snippet: string }, i: number) =>
            `[来源${i + 1}] ${r.title}\n链接：${r.url}\n摘要：${r.snippet}`
          ).join('\n\n');
          prompt = `你是一位专业的研究分析师，基于搜索到的信息和自身知识给出深度分析。

用户提问：${content}

以下是联网搜索到的相关资料：
${searchContext}

请直接以自然语言回复。`;
        }

        const generator = callDeepSeekStream(prompt, { temperature: 0.7, maxTokens: 2000 });

        for await (const chunk of generator) {
          enqueue({ type: 'chunk', content: chunk });
        }

        enqueue({ type: 'done' });
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[stream] 流式生成失败:', msg);
        enqueue({ type: 'error', message: msg.substring(0, 200) });
        controller.close();
      }
    },
  });

  // SSE 流式响应 — 用 Response 而非 NextResponse（NextResponse 类型约束不兼容 ReadableStream）
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  }) as unknown as NextResponse;
});
