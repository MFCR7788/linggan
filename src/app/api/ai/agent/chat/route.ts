// Agent Chat API — 流式多轮 Agent + 小白友好对话
// POST /api/ai/agent/chat → SSE 响应

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { createAdminClient } from '@/lib/supabase-server';
import { ToolRegistry, registerAllBuiltinTools } from '@/lib/agent/tools';
import { agentStreamLoop } from '@/lib/agent/stream';
import {
  CONVERSATIONAL_SYSTEM_PROMPT,
  CONVERSATIONAL_CONFIG,
  CONVERSATIONAL_TOOLS,
  isConversationalQuery,
} from '@/lib/agent/conversational';
import { DEFAULT_AGENT_CONFIG } from '@/lib/agent/types';
import type { AgentConfig, AgentEvent } from '@/lib/agent/types';
import type { ChatMessage } from '@/lib/ai/types';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';
import { SkillsHub } from '@/lib/assistant/skills/hub';
import { compressHistory, buildCompressedMessages } from '@/lib/assistant/context-compressor';
import { LINGJI_IDENTITY } from '@/lib/assistant';
import type { KnowledgeResult } from '@/lib/assistant/types';

// Prompt 注入检测
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
      conversational: conversationalOverride,
      model: selectedModel,
    } = body;

    if (!content && images.length === 0 && documents.length === 0) {
      return NextResponse.json(
        { success: false, error: '内容不能为空' },
        { status: 400 }
      );
    }

    // Prompt 注入检测
    if (content && typeof content === 'string') {
      const lower = content.toLowerCase();
      if (INJECTION_PATTERNS.some((p) => p.test(lower))) {
        return NextResponse.json(
          { success: false, error: '检测到异常输入模式，请重新描述您的需求' },
          { status: 400 }
        );
      }
    }

    // 积分检查
    const creditCost = CREDIT_COSTS.ai_text.perCall;
    try {
      await consume(user.id, creditCost, 'ai_chat', 'Agent 对话', {
        contentLen: content.length,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足: 需要 ${creditCost} 灵力，当前 ${e.available} 灵力`,
            code: 'INSUFFICIENT_CREDITS',
            data: { required: creditCost, available: e.available },
          },
          { status: 402 }
        );
      }
      throw e;
    }

    // 确定对话模式
    const isConversational =
      conversationalOverride !== undefined
        ? conversationalOverride === true
        : isConversationalQuery(content);

    // 并行：加载历史 + 记忆 + 知识 + 技能
    const supabase = createAdminClient();
    const effectiveContent = [content, ...documents].filter(Boolean).join('\n');

    // 历史消息
    let historyMessages: ChatMessage[] = [];
    if (sessionId) {
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('type, content, metadata')
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
      if (compressedSummary) {
        summaryBlock = `[对话历史摘要]\n${compressedSummary}`;
      }
    }

    // 并行获取记忆、知识、技能
    const embedding = await generateEmbedding(effectiveContent).catch(() => []);

    const memoryManager = new MemoryManager();
    memoryManager.addProvider(new BuiltinMemoryProvider());
    await memoryManager.initialize(user.id);

    const knowledgeManager = new KnowledgeManager();
    knowledgeManager.addProvider(new InspirationKnowledgeProvider(user.id));
    knowledgeManager.addProvider(new PublicKnowledgeProvider());

    const skillsHub = new SkillsHub({ userId: user.id });
    await skillsHub.initialize();

    const [memoryBlock, knowledgeResults, skillMatches] = await Promise.all([
      memoryManager.prefetchAll(effectiveContent, embedding).catch(() => ''),
      knowledgeManager.search(effectiveContent, embedding, user.id, 3).catch(() => ({ results: [] as KnowledgeResult[], sources: [], fellBackToWeb: false })),
      skillsHub.matchSkills(effectiveContent, 1),
    ]);

    const skillsBlock = skillMatches.length > 0 ? skillsHub.buildSkillsPromptBlock() : '';

    // 构建 system prompt
    let systemPrompt: string;
    let agentConfig: AgentConfig;

    if (isConversational) {
      systemPrompt = CONVERSATIONAL_SYSTEM_PROMPT;
      agentConfig = { ...CONVERSATIONAL_CONFIG };
      if (selectedModel) agentConfig.model = selectedModel;
    } else {
      systemPrompt = `${LINGJI_IDENTITY}

## 工具使用说明
你可以调用工具来完成用户的请求。当需要获取实时信息、生成内容、或执行操作时，主动调用合适的工具。
在给出最终回答前，确保所有 tool_calls 都有对应的 tool 结果。
如果工具执行失败，尝试其他方法或告知用户。

${summaryBlock}${memoryBlock}`;

      agentConfig = { ...DEFAULT_AGENT_CONFIG };
      if (selectedModel) agentConfig.model = selectedModel;
    }

    // 注入记忆/知识/技能
    if (memoryBlock) {
      systemPrompt += `\n\n## 用户记忆\n${memoryBlock}`;
    }
    if (knowledgeResults.results && knowledgeResults.results.length > 0) {
      const kbBlock = knowledgeResults.results
        .map((r: { title: string; content: string }) => `- ${r.title}: ${r.content.substring(0, 500)}`)
        .join('\n');
      systemPrompt += `\n\n## 知识库\n${kbBlock}`;
    }
    if (skillsBlock) {
      systemPrompt += `\n\n${skillsBlock}`;
    }

    // 构建 messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const hm of historyMessages) {
      messages.push(hm);
    }

    // 用户消息（带附件信息）
    let userContent = content;
    if (images.length > 0) {
      userContent += `\n\n[用户上传了 ${images.length} 张图片: ${images.join(', ')}]`;
    }
    if (documents.length > 0) {
      userContent += `\n\n[用户上传了 ${documents.length} 个文档: ${documents.join(', ')}]`;
    }
    messages.push({ role: 'user', content: userContent });

    // 初始化工具注册表
    const registry = new ToolRegistry();

    if (isConversational) {
      // 对话模式只保留安全工具
      const fullRegistry = new ToolRegistry();
      registerAllBuiltinTools(fullRegistry);
      for (const name of CONVERSATIONAL_TOOLS) {
        const tool = fullRegistry.get(name);
        if (tool) registry.register(tool);
      }
    } else {
      registerAllBuiltinTools(registry);
    }

    // 创建 SSE 流
    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        const abortController = new AbortController();

        const sendEvent = (event: AgentEvent) => {
          if (aborted) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch { /* stream closed */ }
        };

        try {
          let finalContent = '';

          for await (const event of agentStreamLoop(
            messages,
            registry,
            {
              userId: user.id,
              sessionId: sessionId || undefined,
              signal: abortController.signal,
            },
            agentConfig
          )) {
            sendEvent(event);
            if (event.type === 'done') {
              finalContent = event.response;
            }
          }

          // 后台保存 assistant 消息
          if (sessionId && finalContent) {
            try {
              await supabase.from('chat_messages').insert({
                user_id: user.id,
                session_id: sessionId,
                type: 'assistant',
                content: finalContent,
                metadata: {
                  model: agentConfig.model,
                  conversational: isConversational,
                  intent: 'agent',
                },
              });
            } catch (e) {
              console.warn('保存 Agent 消息失败:', e);
            }

            // 更新会话模式标记
            try {
              await supabase
                .from('chat_sessions')
                .update({ is_agent_conversation: isConversational })
                .eq('id', sessionId);
            } catch { /* non-critical */ }
          }

          controller.close();
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          sendEvent({ type: 'error', message: errMsg });
          controller.close();
        }
      },
      cancel() {
        aborted = true;
      },
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
