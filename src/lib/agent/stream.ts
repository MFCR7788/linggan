// Agent SSE Stream — 流式多轮执行
// 通过 SSE 实时推送文字 delta + 工具调用状态
// V2: 通过 ModelRouter 解耦模型调用，通过 ContextEngine 实现真实 token 计数

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolRegistry } from './tools/registry';
import type { AgentConfig, AgentEvent, ToolResult, ToolCallRequest, AgentLoopOptions } from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { ContextEngine } from './context-engine';
import { executeWithTimeout } from './tool-timeout';
import { defaultModelRouter } from '@/lib/providers/model-router';

export async function* agentStreamLoop(
  messages: ChatMessage[],
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal },
  config: AgentConfig = DEFAULT_AGENT_CONFIG,
  options: AgentLoopOptions = {}
): AsyncGenerator<AgentEvent, string, unknown> {
  const modelRouter = options.modelRouter ?? defaultModelRouter;
  const ctxEngine = options.contextEngine ?? new ContextEngine();
  const hooks = options.hooks;
  const toolTimeout = options.toolTimeoutMs ?? 120_000;

  const toolsUsed = new Set<string>();
  const toolCallHistory = new Map<string, number>();

  // agent:start
  if (hooks) {
    await hooks.emit('agent:start', { userId: context.userId, sessionId: context.sessionId, config: { ...config } });
  }

  let iteration = 0;
  const maxIter = config.maxIterations || 10;
  let finalContent = '';
  const allToolResults: Array<{ tool: string; params: Record<string, unknown>; result: ToolResult }> = [];

  while (iteration < maxIter) {
    if (context.signal?.aborted) {
      finalContent = '执行已取消。';
      if (hooks) {
        await hooks.emit('agent:end', { userId: context.userId, sessionId: context.sessionId, response: finalContent, iterations: iteration, toolsUsed: [...toolsUsed] });
      }
      yield { type: 'done', response: finalContent, toolsUsed: [...toolsUsed], tokensUsed: ctxEngine.sessionTotalTokens, toolResults: allToolResults };
      return finalContent;
    }

    yield { type: 'thinking', message: iteration === 0 ? '思考中...' : '继续思考...' };

    // pre_llm_call
    if (hooks) {
      await hooks.emit('pre_llm_call', { userId: context.userId, sessionId: context.sessionId, messages });
    }

    const openaiTools = registry.toOpenAITools();
    let hasToolCalls = false;

    for await (const chunk of modelRouter.chatStreamWithTools(messages, openaiTools, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    })) {
      if (chunk.type === 'text') {
        finalContent += chunk.content;
        yield { type: 'delta', content: chunk.content };
      } else if (chunk.type === 'tool_calls') {
        hasToolCalls = true;

        for (const tc of chunk.calls) {
          const toolArgs = parseArgs(tc);
          yield { type: 'tool_call', tool: tc.function.name, params: toolArgs };

          const toolStartTime = Date.now();
          if (hooks) {
            await hooks.emit('pre_tool_call', { userId: context.userId, sessionId: context.sessionId, toolName: tc.function.name, toolArgs });
          }

          const result = await executeToolCall(
            tc, registry,
            { userId: context.userId, sessionId: context.sessionId, signal: context.signal },
            toolCallHistory,
            toolTimeout
          );
          toolsUsed.add(tc.function.name);

          if (hooks) {
            await hooks.emit('post_tool_call', { userId: context.userId, sessionId: context.sessionId, toolName: tc.function.name, toolArgs, toolResult: result, toolDuration: Date.now() - toolStartTime });
          }

          const sseResult: ToolResult = {
            success: result.success,
            output: result.output.length > 500 ? result.output.substring(0, 500) + '...' : result.output,
            data: result.data,
            error: result.error,
          };
          allToolResults.push({ tool: tc.function.name, params: toolArgs, result: sseResult });
          yield { type: 'tool_result', tool: tc.function.name, result: sseResult };

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

    if (!hasToolCalls) {
      if (hooks) {
        await hooks.emit('agent:end', { userId: context.userId, sessionId: context.sessionId, response: finalContent, iterations: iteration + 1, toolsUsed: [...toolsUsed] });
      }
      yield {
        type: 'done',
        response: finalContent,
        summary: finalContent.substring(0, 50),
        toolsUsed: [...toolsUsed],
        tokensUsed: ctxEngine.sessionTotalTokens,
        model: config.model,
        toolResults: allToolResults,
      };
      return finalContent;
    }

    // 上下文压缩
    if (iteration >= 3 && ctxEngine.shouldCompress(messages)) {
      const compressed = await ctxEngine.compress(messages);
      messages.length = 0;
      for (const m of compressed) messages.push(m);
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
    const finalText = await modelRouter.chat(messages, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
    finalContent = finalText;
    yield { type: 'delta', content: finalText };
  } catch {
    finalContent = '\n\n已达到最大思考步骤。请简化问题后重试。';
    yield { type: 'delta', content: finalContent };
  }

  if (hooks) {
    await hooks.emit('agent:end', { userId: context.userId, sessionId: context.sessionId, response: finalContent, iterations: maxIter, toolsUsed: [...toolsUsed] });
  }
  yield {
    type: 'done',
    response: finalContent,
    summary: finalContent.substring(0, 50),
    toolsUsed: [...toolsUsed],
    tokensUsed: ctxEngine.sessionTotalTokens,
    model: config.model,
    toolResults: allToolResults,
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

async function executeToolCall(
  tc: ToolCallRequest,
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal },
  history: Map<string, number>,
  timeoutMs: number
): Promise<ToolResult> {
  const toolName = tc.function.name;
  const args = parseArgs(tc);

  const hash = `${toolName}:${JSON.stringify(args)}`;
  const count = (history.get(hash) || 0) + 1;
  history.set(hash, count);
  if (count >= 3) {
    return { success: false, output: '', error: '该工具已重复调用多次，请尝试其他方法。' };
  }

  const tool = registry.get(toolName);
  if (!tool) {
    return { success: false, output: '', error: `未找到工具: ${toolName}` };
  }

  return executeWithTimeout(
    tool.handler,
    args,
    { userId: context.userId, sessionId: context.sessionId, signal: context.signal },
    { timeoutMs, isLongRunning: tool.isLongRunning }
  );
}
