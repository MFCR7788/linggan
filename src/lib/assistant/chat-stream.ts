// Chat Stream — SSE 流式输出逻辑
// 从 src/app/api/ai/chat/route.ts 提取

import { NextResponse } from 'next/server';
import { callDeepSeekStream } from '@/lib/ai-services';
import { createAdminClient } from '@/lib/supabase-server';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { LongTermMemoryProvider } from '@/lib/memory/long-term/provider';
import { extractJSON, stripMarkdown } from './chat-pipeline';
import type { DetectedIntent } from '@/lib/assistant';

export function createChatStreamResponse(
  userPrompt: string,
  genMaxTokens: number,
  sessionId: string | undefined,
  userId: string,
  intent: DetectedIntent,
  content: string,
  historyMessages: { role: 'user' | 'assistant'; content: string }[],
  contextStats: any,
): NextResponse {
  const supabase = createAdminClient();
  const encoder = new TextEncoder();
  let fullContent = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of callDeepSeekStream(userPrompt, { temperature: 0.7, maxTokens: genMaxTokens })) {
          fullContent += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }

        // 解析完整响应
        let analysis: any = null;
        let modelUsed = '';
        const parsed = extractJSON(fullContent);
        if (parsed) {
          analysis = parsed;
          modelUsed = 'deepseek-stream';
        } else {
          const cleaned = fullContent.replace(/```[\s\S]*?```/g, '').trim();
          analysis = {
            response: cleaned || fullContent,
            summary: (cleaned || fullContent).substring(0, 50),
            tags: [],
            suggestions: [],
            intent: intent.label,
          };
          modelUsed = 'deepseek-stream';
        }

        // 保存 assistant 消息到 DB
        if (sessionId) {
          try {
            const assistantContent = analysis.response || fullContent;
            await supabase.from('chat_messages').insert({
              user_id: userId,
              session_id: sessionId,
              type: 'ai',
              content: assistantContent,
              metadata: { model: modelUsed, intent: intent.type },
            });
          } catch (e) { console.warn('保存 streaming 消息失败:', e); }
        }

        // 异步提取记忆（双写 Supabase + SQLite）
        if (sessionId) {
          const memMgr = new MemoryManager();
          const builtin = new BuiltinMemoryProvider();
          await builtin.initialize(userId);
          memMgr.addProvider(builtin);
          memMgr.addProvider(new LongTermMemoryProvider());
          const userMsg = content || '';
          const assistantMsg = analysis.response || '';
          const msgs = [
            ...historyMessages,
            { role: 'user' as const, content: userMsg },
            { role: 'assistant' as const, content: assistantMsg },
          ];
          memMgr.onSessionEnd(sessionId, msgs as any).catch(e => console.warn('[Memory] onSessionEnd 失败:', e));
        }

        // 发送最终结果
        if (!analysis.intent) analysis.intent = intent.label;
        if (analysis.response) analysis.response = stripMarkdown(analysis.response);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          response: analysis.response,
          summary: analysis.summary,
          tags: analysis.tags || [],
          suggestions: analysis.suggestions || [],
          _model: modelUsed,
          _intent: intent.type,
          _context: contextStats,
        })}\n\n`));
        controller.close();
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
