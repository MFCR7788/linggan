// Agent Chat API — 流式多轮 Agent（统一模式：引导式对话 + 工具调用）
// POST /api/ai/agent/chat → SSE 响应
// V2: 使用 ContextAssembler 统一组装上下文

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { createAdminClient } from '@/lib/supabase-server';
import { ToolRegistry, registerAllBuiltinTools } from '@/lib/agent/tools';
import { agentStreamLoop } from '@/lib/agent/stream';
import { AGENT_SYSTEM_PROMPT, DEFAULT_CONFIG } from '@/lib/agent/conversational';
import type { AgentEvent } from '@/lib/agent/types';
import type { ChatMessage } from '@/lib/ai/types';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';
import { SkillsHub } from '@/lib/assistant/skills/hub';
import { compressHistory } from '@/lib/assistant/context-compressor';
import { extractDocuments } from '@/lib/assistant/chat-helpers';
import { ContextAssembler, MemorySource, KnowledgeSource, SkillSource } from '@/lib/context';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|your)\s+instructions?/i,
  /system\s*:\s*you\s+are\s+now/i,
  /pretend\s+you\s+are\s+(a\s+)?(different|another)/i,
  /you\s+are\s+now\s+(DAN|jailbroken|unrestricted)/i,
  /forget\s+(all\s+)?your\s+(training|programming|rules)/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
];

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await request.json();
    const {
      content = '',
      images = [],
      documents = [],
      session_id: sessionId,
      model: selectedModel,
    } = body;

    if (!content && images.length === 0 && documents.length === 0) {
      return NextResponse.json({ success: false, error: '内容不能为空' }, { status: 400 });
    }

    if (content && typeof content === 'string') {
      const lower = content.toLowerCase();
      if (INJECTION_PATTERNS.some((p) => p.test(lower))) {
        return NextResponse.json(
          { success: false, error: '检测到异常输入模式，请重新描述您的需求' },
          { status: 400 }
        );
      }
    }

    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_chat', 'Agent 对话', { contentLen: content.length });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足: 需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const supabase = createAdminClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // 提取文档内容
    let documentTexts: string[] = [];
    if (documents.length > 0 && supabaseUrl) {
      documentTexts = await extractDocuments(documents, user.id, supabaseUrl);
    }

    const effectiveContent = [content, ...documentTexts].filter(Boolean).join('\n');

    // 历史消息
    let historyMessages: ChatMessage[] = [];
    if (sessionId) {
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('type, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(40);

      if (msgs) {
        const typed = msgs as Array<{ type: string; content: string }>;
        historyMessages = typed.map((m) => ({
          role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }));
      }
    }

    // 上下文压缩
    let summaryBlock = '';
    if (historyMessages.length > 30) {
      const { compressedSummary, recentMessages } = await compressHistory(
        historyMessages as Array<{ role: 'user' | 'assistant'; content: string }>
      );
      historyMessages = recentMessages as ChatMessage[];
      if (compressedSummary) summaryBlock = `[对话历史摘要]\n${compressedSummary}`;
    }

    // 初始化工具注册表
    const registry = new ToolRegistry();
    registerAllBuiltinTools(registry);

    // 初始化记忆/知识/技能
    const memoryManager = new MemoryManager();
    memoryManager.addProvider(new BuiltinMemoryProvider());
    await memoryManager.initialize(user.id);

    const knowledgeManager = new KnowledgeManager();
    knowledgeManager.addProvider(new InspirationKnowledgeProvider(user.id));
    knowledgeManager.addProvider(new PublicKnowledgeProvider());

    const skillsHub = new SkillsHub({ userId: user.id });
    await skillsHub.initialize();

    // === V2: 使用 ContextAssembler 统一组装上下文 ===
    const assembler = new ContextAssembler(AGENT_SYSTEM_PROMPT);
    assembler.registerSource(new MemorySource(memoryManager));
    assembler.registerSource(new KnowledgeSource(knowledgeManager));
    assembler.registerSource(new SkillSource(skillsHub, registry));

    const assembled = await assembler.assemble({
      userId: user.id,
      sessionId: sessionId || undefined,
      userMessage: content,
      images,
      documents,
      historyMessages: historyMessages.length > 0 ? historyMessages : undefined,
      summaryBlock: summaryBlock || undefined,
    });

    const agentConfig = {
      ...DEFAULT_CONFIG,
      ...(selectedModel ? { model: selectedModel } : {}),
    };

    // 补充文档内容到 user message
    if (documentTexts.length > 0) {
      const lastMsg = assembled.messages[assembled.messages.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        lastMsg.content += `\n\n[文档内容]\n\n${documentTexts.join('\n\n---\n\n')}`;
      }
    }

    // SSE 流
    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        const abortController = new AbortController();

        const sendEvent = (event: AgentEvent) => {
          if (aborted) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* closed */ }
        };

        try {
          let finalContent = '';
          const completedToolCalls: Array<{ tool: string; params: Record<string, unknown>; result: { success: boolean; output: string; data?: unknown; error?: string } }> = [];

          // 保存用户消息
          if (sessionId) {
            try {
              await supabase.from('chat_messages').insert({
                user_id: user.id, session_id: sessionId, type: 'user',
                content: effectiveContent,
                attachments: images.map((url: string, i: number) => ({ url, name: `图片 ${i + 1}`, type: 'image' })),
                metadata: { images, documents },
              });
            } catch (e) { console.warn('保存用户消息失败:', e); }
          }

          for await (const event of agentStreamLoop(assembled.messages, registry, {
            userId: user.id,
            sessionId: sessionId || undefined,
            signal: abortController.signal,
          }, agentConfig)) {
            sendEvent(event);
            if (event.type === 'tool_call') {
              completedToolCalls.push({ tool: event.tool, params: event.params, result: { success: true, output: '' } });
            }
            if (event.type === 'tool_result') {
              const last = completedToolCalls.filter(t => t.tool === event.tool).pop();
              if (last) last.result = event.result;
            }
            if (event.type === 'done') finalContent = event.response;
          }

          if (sessionId && finalContent) {
            try {
              const generatedImages: string[] = [];
              let generatedVideo: { taskId: string; status: string; videoUrl?: string } | null = null;
              let generatedAudio: string | null = null;
              const toolCallsMeta = completedToolCalls.map(tc => ({
                tool: tc.tool,
                params: tc.params,
                result: { success: tc.result.success, output: tc.result.output.substring(0, 500) },
              }));

              for (const tc of completedToolCalls) {
                const d = tc.result.data as Record<string, unknown> | undefined;
                if (!d) continue;
                if (tc.tool === 'generate_image' && Array.isArray(d.imageUrls)) {
                  generatedImages.push(...(d.imageUrls as string[]));
                }
                if (tc.tool === 'generate_video' && d.taskId) {
                  generatedVideo = { taskId: d.taskId as string, status: (d.status as string) || 'queued' };
                }
                if (tc.tool === 'synthesize_speech' && d.audioBase64) {
                  generatedAudio = `data:audio/mpeg;base64,${d.audioBase64}`;
                }
              }

              await supabase.from('chat_messages').insert({
                user_id: user.id, session_id: sessionId, type: 'assistant',
                content: finalContent,
                metadata: {
                  model: agentConfig.model, intent: 'agent',
                  toolCalls: toolCallsMeta,
                  ...(generatedImages.length > 0 ? { generatedImages } : {}),
                  ...(generatedVideo ? { generatedVideo } : {}),
                  ...(generatedAudio ? { generatedAudio } : {}),
                },
              });
            } catch (e) { console.warn('保存 Agent 消息失败:', e); }
          }

          controller.close();
        } catch (e) {
          sendEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
          controller.close();
        }
      },
      cancel() { aborted = true; },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    console.error('Agent chat error:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '处理请求时出错' },
      { status: 500 }
    );
  }
});
