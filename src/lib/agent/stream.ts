// Agent SSE Stream — 流式多轮执行
// 通过 SSE 实时推送文字 delta + 工具调用状态
// V2: 通过 ModelRouter 解耦模型调用，通过 ContextEngine 实现真实 token 计数
// V3: 目标分解 (Plan-then-Execute)

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolRegistry } from './tools/registry';
import type { AgentConfig, AgentEvent, ToolResult, ToolCallRequest, AgentLoopOptions, ExecutionPlan } from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { ContextEngine } from './context-engine';
import { executeWithTimeoutAndRecovery } from './tool-timeout';
import { defaultModelRouter } from '@/lib/providers/model-router';

// 清理 Agent 输出中的 markdown 分隔线和工具调用痕迹
function cleanupOutput(text: string): string {
  return text
    .replace(/^---+\s*$/gm, '')        // 独立成行的 --- 分隔线
    .replace(/\n{3,}/g, '\n\n')        // 多余空行合并
    .trim();
}
import { GoalPlanner, getCurrentStep } from './goal-planner';
import { GoalProgressTracker } from './goal-progress';
import { groupToolCallsForExecution } from './tools/parallelizer';

export async function* agentStreamLoop(
  messages: ChatMessage[],
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal; presets?: import('./types').AgentPresets },
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

  // 目标分解：复杂任务先生成执行计划
  let plan: ExecutionPlan | null = null;
  const progressTracker = new GoalProgressTracker();
  const maxIter = config.maxIterations || 10;

  if (maxIter >= 5) {
    const userMsg = messages.filter(m => m.role === 'user').pop();
    if (userMsg && typeof userMsg.content === 'string') {
      const planner = new GoalPlanner();
      plan = await planner.plan(userMsg.content);
      if (plan) {
        progressTracker.setPlan(plan);
        yield { type: 'plan_generated', plan };
      }
    }
  }

  let iteration = 0;
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

    const currentStep = plan ? getCurrentStep(plan) : null;
    const thinkingMsg = iteration === 0
      ? (currentStep ? `执行步骤: ${currentStep.title}` : '思考中...')
      : '继续思考...';
    yield { type: 'thinking', message: thinkingMsg };

    // pre_llm_call
    if (hooks) {
      await hooks.emit('pre_llm_call', { userId: context.userId, sessionId: context.sessionId, messages });
    }

    // token 预算硬限制：防止上下文溢出
    messages = ctxEngine.enforceBudget(messages);

    const openaiTools = registry.toOpenAITools();
    let hasToolCalls = false;

    for await (const chunk of modelRouter.chatStreamWithTools(messages, openaiTools, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      taskType: 'main_chat',
    })) {
      if (chunk.type === 'text') {
        finalContent += chunk.content;
        yield { type: 'delta', content: chunk.content };
      } else if (chunk.type === 'tool_calls') {
        hasToolCalls = true;

        // 并行化：分组工具调用
        const grouped = groupToolCallsForExecution(chunk.calls);
        const allCalls = [...grouped.parallel.flat(), ...grouped.serial];

        // 构建快速查找：tc.id → 是否在平行组
        const parallelIds = new Set(grouped.parallel.flat().map(tc => tc.id));

        for (const tc of allCalls) {
          const toolArgs = parseArgs(tc);
          yield { type: 'tool_call', tool: tc.function.name, params: toolArgs };

          const toolStartTime = Date.now();
          if (hooks) {
            await hooks.emit('pre_tool_call', { userId: context.userId, sessionId: context.sessionId, toolName: tc.function.name, toolArgs });
          }

          const result = await executeToolCall(
            tc, registry,
            { userId: context.userId, sessionId: context.sessionId, signal: context.signal, presets: context.presets },
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

          // 更新计划进度
          if (plan) {
            progressTracker.markToolExecuted(tc.function.name);
            const snapshot = progressTracker.getSnapshot();
            if (snapshot && !snapshot.isComplete) {
              yield {
                type: 'plan_progress',
                goal: snapshot.goal,
                totalSteps: snapshot.totalSteps,
                completedSteps: snapshot.completedSteps,
                currentStep: snapshot.currentStep?.title || null,
              };
            }
          }

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

      // H4 fix: 流式 API 不返回 usage，用估算替代
      ctxEngine.updateFromResponse({
        prompt_tokens: ctxEngine.estimateTokens(messages),
        completion_tokens: Math.ceil(finalContent.length / 2),
        total_tokens: 0, // 由 updateFromResponse 累加
      });
    }

    if (!hasToolCalls) {
      const cleaned = cleanupOutput(finalContent);
      if (hooks) {
        await hooks.emit('agent:end', { userId: context.userId, sessionId: context.sessionId, response: cleaned, iterations: iteration + 1, toolsUsed: [...toolsUsed] });
      }
      yield {
        type: 'done',
        response: cleaned,
        summary: cleaned.substring(0, 50),
        toolsUsed: [...toolsUsed],
        tokensUsed: ctxEngine.sessionTotalTokens,
        model: config.model,
        toolResults: allToolResults,
      };
      return cleaned;
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
      taskType: 'main_chat',
    });
    finalContent = finalText;
    yield { type: 'delta', content: finalText };
  } catch {
    finalContent = '\n\n已达到最大思考步骤。请简化问题后重试。';
    yield { type: 'delta', content: finalContent };
  }

  const cleaned = cleanupOutput(finalContent);
  if (hooks) {
    await hooks.emit('agent:end', { userId: context.userId, sessionId: context.sessionId, response: cleaned, iterations: maxIter, toolsUsed: [...toolsUsed] });
  }
  yield {
    type: 'done',
    response: cleaned,
    summary: cleaned.substring(0, 50),
    toolsUsed: [...toolsUsed],
    tokensUsed: ctxEngine.sessionTotalTokens,
    model: config.model,
    toolResults: allToolResults,
  };
  return cleaned;
}

function parseArgs(tc: ToolCallRequest): Record<string, unknown> {
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    try {
      const repaired = tc.function.arguments.replace(/,(\s*[\]}])/g, '$1');
      return JSON.parse(repaired);
    } catch {
      return {};
    }
  }
}

async function executeToolCall(
  tc: ToolCallRequest,
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal; presets?: import('./types').AgentPresets },
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

  return executeWithTimeoutAndRecovery(
    toolName,
    tool.handler,
    args,
    { userId: context.userId, sessionId: context.sessionId, signal: context.signal, presets: context.presets },
    { timeoutMs, isLongRunning: tool.isLongRunning }
  );
}
