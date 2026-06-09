// Agent SSE Stream — 流式多轮执行
// 通过 SSE 实时推送文字 delta + 工具调用状态

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolRegistry } from './tools/registry';
import type { AgentConfig, AgentEvent, ToolResult, ToolCallRequest } from './types';
import { callDeepSeekStreamWithTools, callDeepSeek } from '@/lib/ai-services';
import { DEFAULT_AGENT_CONFIG } from './types';
import { compressHistory } from '@/lib/assistant/context-compressor';

export async function* agentStreamLoop(
  messages: ChatMessage[],
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal },
  config: AgentConfig = DEFAULT_AGENT_CONFIG
): AsyncGenerator<AgentEvent, string, unknown> {
  const toolsUsed = new Set<string>();
  const toolCallHistory = new Map<string, number>();
  let iteration = 0;
  const maxIter = config.maxIterations || 10;
  let finalContent = '';

  while (iteration < maxIter) {
    if (context.signal?.aborted) {
      finalContent = '执行已取消。';
      yield { type: 'done', response: finalContent, toolsUsed: [...toolsUsed] };
      return finalContent;
    }

    yield { type: 'thinking', message: iteration === 0 ? '思考中...' : '继续思考...' };

    const openaiTools = registry.toOpenAITools();
    let hasToolCalls = false;
    let hasTextContent = false;

    // 流式 LLM 调用
    for await (const chunk of callDeepSeekStreamWithTools(messages, openaiTools, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    })) {
      if (chunk.type === 'text') {
        hasTextContent = true;
        finalContent += chunk.content;
        yield { type: 'delta', content: chunk.content };
      } else if (chunk.type === 'tool_calls') {
        hasToolCalls = true;
        // tool_calls 在流结束时才完整 — 执行它们
        for (const tc of chunk.calls) {
          yield { type: 'tool_call', tool: tc.function.name, params: parseArgs(tc) };

          const result: ToolResult = await executeTool(tc, registry, context, toolCallHistory);
          toolsUsed.add(tc.function.name);

          yield {
            type: 'tool_result',
            tool: tc.function.name,
            result: {
              success: result.success,
              output: result.output.length > 500 ? result.output.substring(0, 500) + '...' : result.output,
              error: result.error,
            },
          };

          // 将工具调用+结果注入历史
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [tc],
          } as unknown as ChatMessage);

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.success
              ? (result.output.length > 2000 ? result.output.substring(0, 2000) + '\n...(已截断)' : result.output)
              : `失败: ${result.error || '未知错误'}`,
          } as unknown as ChatMessage);
        }
      }
    }

    // 如果本轮返回了文本且无 tool calls → 完成
    if (!hasToolCalls) {
      yield {
        type: 'done',
        response: finalContent,
        summary: finalContent.substring(0, 50),
        toolsUsed: [...toolsUsed],
      };
      return finalContent;
    }

    // 如果有 tool calls 但无文本 — 继续下一轮

    // 压缩检查
    if (iteration >= 3 && messages.length > 20) {
      const { compressedSummary, recentMessages } = await compressHistory(
        messages.filter((m) => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>
      );
      if (compressedSummary) {
        const systemMsg = messages.find((m) => m.role === 'system');
        messages.length = 0;
        if (systemMsg) messages.push(systemMsg);
        messages.push({ role: 'user', content: `[对话历史摘要]\n${compressedSummary}` } as ChatMessage);
        for (const rm of recentMessages) {
          messages.push(rm as ChatMessage);
        }
      }
    }

    iteration++;
  }

  // 最大迭代：强制总结
  yield { type: 'delta', content: '\n\n已达到最大思考步数，正在汇总结果...\n\n' };

  messages.push({
    role: 'user',
    content: '请基于以上所有工具调用结果和对话内容，给出最终回答。直接输出，不要再调用工具。',
  } as ChatMessage);

  try {
    const finalText = await callDeepSeek(
      messages.map((m) => {
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${m.role}: ${c}`;
      }).join('\n\n'),
      { temperature: config.temperature, maxTokens: config.maxTokens }
    );
    finalContent = finalText;
    yield { type: 'delta', content: finalText };
  } catch {
    finalContent = '\n\n已达到最大思考步骤。请简化问题后重试。';
    yield { type: 'delta', content: finalContent };
  }

  yield {
    type: 'done',
    response: finalContent,
    summary: finalContent.substring(0, 50),
    toolsUsed: [...toolsUsed],
  };
  return finalContent;
}

function parseArgs(tc: ToolCallRequest): Record<string, unknown> {
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    return {};
  }
}

async function executeTool(
  tc: ToolCallRequest,
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal },
  history: Map<string, number>
): Promise<ToolResult> {
  const toolName = tc.function.name;
  const args = parseArgs(tc);

  // 防死循环
  const hash = `${toolName}:${JSON.stringify(args)}`;
  const count = (history.get(hash) || 0) + 1;
  history.set(hash, count);
  if (count >= 3) {
    return { success: false, output: '', error: '该工具已重复调用多次，请尝试其他方法。' };
  }

  return registry.execute(toolName, args, {
    userId: context.userId,
    sessionId: context.sessionId,
    signal: context.signal,
  });
}
