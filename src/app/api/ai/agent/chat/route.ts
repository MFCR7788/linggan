// Agent Chat API — 流式多轮 Agent（统一模式：引导式对话 + 工具调用）
// POST /api/ai/agent/chat → SSE 响应
// V2: 使用 ContextAssembler 统一组装上下文

export const maxDuration = 120; // 最高 120s，防止 Agent 多轮调用超时

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { consume, InsufficientCreditsError } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { createAdminClient } from '@/lib/supabase-server';
import { ToolRegistry, registerAllBuiltinTools } from '@/lib/agent/tools';
import { agentStreamLoop } from '@/lib/agent/stream';
import { MCPManager } from '@/lib/mcp/manager';
import { getDefaultMCPServers } from '@/lib/mcp/defaults';
import { detectCrossPlatform, delegateMultiPlatform, formatDelegationResult } from '@/lib/agent/delegation';
import { AGENT_SYSTEM_PROMPT, DEFAULT_CONFIG } from '@/lib/agent/conversational';
import type { AgentEvent } from '@/lib/agent/types';
import type { ChatMessage } from '@/lib/ai/types';
import { HookManager, qualityReviewHook } from '@/lib/hooks';
import { detectIntent } from '@/lib/assistant/intent';
import { generateEmbedding } from '@/lib/assistant/embedding';
import { MemoryManager } from '@/lib/assistant/memory/manager';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { LongTermMemoryProvider } from '@/lib/memory/long-term/provider';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';
import { SkillsHub } from '@/lib/assistant/skills/hub';
import { compressHistory } from '@/lib/assistant/context-compressor';
import { extractDocuments } from '@/lib/assistant/chat-helpers';
import { ContextAssembler, MemorySource, KnowledgeSource, SkillSource, ComboSkillSource } from '@/lib/context';
import { agentSkillMatcher, getAllComboSkills, getAllPresetSkills } from '@/lib/agent/skills';

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
      presets,
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

    // 初始化 MCP Server（默认接入 GitHub 等，未配置 token 时优雅降级）
    const mcpManager = new MCPManager(registry);
    const defaultMCPServers = getDefaultMCPServers();
    if (defaultMCPServers.length > 0) {
      await mcpManager.initialize(defaultMCPServers);
    }

    // 初始化 Hook 系统 — 审核Agent 在工具执行后自动检查生成内容质量
    const hooks = new HookManager();
    hooks.register(qualityReviewHook);

    // 初始化记忆/知识/技能
    const memoryManager = new MemoryManager();
    memoryManager.addProvider(new BuiltinMemoryProvider());
    memoryManager.addProvider(new LongTermMemoryProvider());
    await memoryManager.initialize(user.id);

    const knowledgeManager = new KnowledgeManager();
    knowledgeManager.addProvider(new InspirationKnowledgeProvider(user.id));
    knowledgeManager.addProvider(new PublicKnowledgeProvider());

    const skillsHub = new SkillsHub({ userId: user.id });
    await skillsHub.initialize();

    // 加载 combo + 预设技能到 Agent 技能匹配器（首次加载后缓存）
    if (agentSkillMatcher.getAllSkills().length === 0) {
      const comboSKills = getAllComboSkills();
      const presetSkills = getAllPresetSkills();
      agentSkillMatcher.loadSkills([...comboSKills, ...presetSkills]);
    }

    // C12: 检测跨平台委托 — 多平台请求直接并行生成，不走 Agent 循环
    const crossPlatforms = detectCrossPlatform(content);
    if (crossPlatforms.length >= 2) {
      console.log(`[Agent] 检测到跨平台委托: ${crossPlatforms.join(', ')}`);
      const delegationResult = await delegateMultiPlatform(content, crossPlatforms);
      const formatted = formatDelegationResult(delegationResult);

      // 保存消息
      if (sessionId) {
        const supabase = createAdminClient();
        await supabase.from('chat_messages').insert([
          { user_id: user.id, session_id: sessionId, type: 'user', content },
          { user_id: user.id, session_id: sessionId, type: 'ai', content: formatted, metadata: { source: 'delegation', platforms: crossPlatforms } },
        ]);
      }

      return NextResponse.json({
        success: true,
        response: formatted,
        summary: `已生成 ${crossPlatforms.length} 个平台版本`,
        _intent: 'cross-platform',
        _context: { delegation: true, platforms: crossPlatforms, durationMs: delegationResult.totalDurationMs },
      });
    }

    // === V2: 使用 ContextAssembler 统一组装上下文 ===
    const assembler = new ContextAssembler(AGENT_SYSTEM_PROMPT);
    assembler.registerSource(new MemorySource(memoryManager));
    assembler.registerSource(new KnowledgeSource(knowledgeManager));
    assembler.registerSource(new ComboSkillSource(agentSkillMatcher));
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

    // 注入用户预配置资产状态（数字分身 / 角色形象）
    if (presets) {
      const presetLines: string[] = [];
      const avatar = presets.avatar as Record<string, unknown> | undefined;
      const animate = presets.animate as Record<string, unknown> | undefined;
      if (avatar?.status === 'ready') {
        presetLines.push(`- 数字分身已就绪: "${avatar.name}" (avatarId: ${avatar.avatarId})。用户说"用我的分身"时，直接调用 generate_avatar_video 工具生成口播视频。`);
      }
      if (animate) {
        presetLines.push(`- 角色形象已配置: "${animate.name}"。用户说"用我的形象"时，直接调用 generate_animate_video 工具（需用户提供参考动作视频URL）。`);
      }
      if (presetLines.length > 0) {
        const presetBlock = `\n\n[用户预配置资产]\n${presetLines.join('\n')}\n注意: 以上资产可直接通过 generate_avatar_video / generate_animate_video 工具调用，无需引导用户去其他页面。`;
        assembled.messages[0].content += presetBlock;
      }
    }

    // V3.0: 意图检测由 System Prompt 工具路由表 + Skill 匹配统一处理
    // detectIntent 的逻辑已融入 conversational.ts 的 §1 工具路由 + SkillMatcher
    const detectedSkill = assembled.skillsUsed.length > 0 ? assembled.skillsUsed[0] : null;
    if (detectedSkill) {
      const isGeneration = /copywriting|image|video|digital_human|tts|grid|product_video/.test(detectedSkill);
      if (isGeneration) {
        const toolHint = `\n\n[系统指令] 用户意图匹配到技能「${detectedSkill}」。请按照 §1 工具路由表选择合适的工具，优先调用生成工具。不要反问，直接调用工具。`;
        assembled.messages[0].content += toolHint;
      }
    }

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

          // 发送技能匹配结果
          if (assembled.skillsUsed.length > 0) {
            const skillRecs = assembled.skillsUsed.map((name) => {
              const skill = agentSkillMatcher.getAllSkills().find(s => s.name === name);
              return { name, displayName: skill?.displayName || name, score: 1 };
            });
            if (skillRecs.length > 0) {
              sendEvent({ type: 'skills_matched', recommendations: skillRecs });
            }
          }

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

          // 构建 agent 上下文（含预配置资产）
          const agentContext: {
            userId: string;
            sessionId?: string;
            signal: AbortSignal;
            presets?: import('@/lib/agent/types').AgentPresets;
          } = {
            userId: user.id,
            sessionId: sessionId || undefined,
            signal: abortController.signal,
          };
          if (presets) {
            const avatar = presets.avatar as Record<string, unknown> | undefined;
            const animate = presets.animate as Record<string, unknown> | undefined;
            if (avatar?.status === 'ready' && avatar.avatarId) {
              agentContext.presets = {
                ...agentContext.presets,
                avatar: {
                  name: avatar.name as string || '我的分身',
                  avatarId: avatar.avatarId as string,
                  status: 'ready',
                },
              };
            }
            if (animate?.imageUrl) {
              agentContext.presets = {
                ...agentContext.presets,
                animate: {
                  name: animate.name as string || '我的形象',
                  imageUrl: animate.imageUrl as string,
                },
              };
            }
          }

          for await (const event of agentStreamLoop(assembled.messages, registry, agentContext, agentConfig, { hooks })) {
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
              let schedules: Array<{ title: string; scheduled_at: string; description?: string; location?: string; suggestions?: string[] }> | null = null;
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
                  generatedVideo = {
                    taskId: d.taskId as string,
                    status: (d.status as string) || 'queued',
                    videoUrl: d.videoUrl as string | undefined,
                  };
                }
                if (tc.tool === 'generate_video_template' && d.url) {
                  generatedVideo = { taskId: d.renderId as string || '', status: 'completed', videoUrl: d.url as string };
                }
                if (tc.tool === 'synthesize_speech' && d.audioBase64) {
                  generatedAudio = `data:audio/mpeg;base64,${d.audioBase64}`;
                }
                if (tc.tool === 'extract_schedule' && Array.isArray(d.schedules)) {
                  schedules = d.schedules as Array<{ title: string; scheduled_at: string; description?: string; location?: string; suggestions?: string[] }>;
                }
              }

              await supabase.from('chat_messages').insert({
                user_id: user.id, session_id: sessionId, type: 'ai',
                content: finalContent,
                metadata: {
                  model: agentConfig.model, intent: 'agent',
                  toolCalls: toolCallsMeta,
                  ...(generatedImages.length > 0 ? { generatedImages } : {}),
                  ...(generatedVideo ? { generatedVideo } : {}),
                  ...(generatedAudio ? { generatedAudio } : {}),
                  ...(schedules ? { schedules } : {}),
                },
              });
            } catch (e) { console.warn('保存 Agent 消息失败:', e); }

            // 异步提取长期记忆（不阻塞响应）
            try {
              const conversationMessages: ChatMessage[] = [
                ...assembled.messages.filter(m => m.role === 'user' || m.role === 'assistant'),
                { role: 'assistant', content: finalContent } as ChatMessage,
              ];
              await memoryManager.onSessionEnd(sessionId, conversationMessages);
            } catch (e) { console.warn('记忆提取失败:', e); }
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
