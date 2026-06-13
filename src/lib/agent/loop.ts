// Agent Loop — ReAct 模式多轮执行
// Reasoning + Acting: 模型决定调用工具 → 执行 → 结果注入 → 继续 → 最终输出
// V2: 通过 ModelRouter 解耦模型调用，通过 ContextEngine 实现真实 token 计数
// V3: 目标分解 (Plan-then-Execute)

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolRegistry } from './tools/registry';
import type { AgentConfig, AgentLoopOptions, ExecutionPlan, ToolCallRequest } from './types';
import { DEFAULT_AGENT_CONFIG } from './types';
import { ContextEngine } from './context-engine';
import { executeWithTimeoutAndRecovery } from './tool-timeout';
import { defaultModelRouter } from '@/lib/providers/model-router';
import { GoalPlanner, updatePlanProgress, getCurrentStep } from './goal-planner';
import { groupToolCallsForExecution } from './tools/parallelizer';

interface AgentLoopResult {
  content: string;
  iterations: number;
  toolsUsed: string[];
  totalTokensUsed: number;
}

export async function agentLoop(
  messages: ChatMessage[],
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal; presets?: import('./types').AgentPresets },
  config: AgentConfig = DEFAULT_AGENT_CONFIG,
  options: AgentLoopOptions = {}
): Promise<AgentLoopResult> {
  const modelRouter = options.modelRouter ?? defaultModelRouter;
  const ctxEngine = options.contextEngine ?? new ContextEngine();
  const hooks = options.hooks;
  const toolTimeout = options.toolTimeoutMs ?? 120_000;

  // agent:start
  if (hooks) {
    await hooks.emit('agent:start', { userId: context.userId, sessionId: context.sessionId, config: { ...config } });
  }

  // 目标分解：复杂任务先生成执行计划
  let plan: ExecutionPlan | null = null;
  const maxIter = config.maxIterations || 10;

  if (maxIter >= 5) {
    const userMsg = messages.filter(m => m.role === 'user').pop();
    if (userMsg && typeof userMsg.content === 'string') {
      const planner = new GoalPlanner();
      plan = await planner.plan(userMsg.content);
    }
  }

  const toolsUsed = new Set<string>();
  const toolCallHistory = new Map<string, number>();
  let iteration = 0;

  while (iteration < maxIter) {
    if (context.signal?.aborted) {
      if (hooks) {
        await hooks.emit('agent:end', {
          userId: context.userId, sessionId: context.sessionId,
          response: '执行已取消。', iterations: iteration,
          toolsUsed: [...toolsUsed],
        });
      }
      return {
        content: '执行已取消。',
        iterations: iteration,
        toolsUsed: [...toolsUsed],
        totalTokensUsed: ctxEngine.sessionTotalTokens,
      };
    }

    // pre_llm_call hook
    if (hooks) {
      await hooks.emit('pre_llm_call', { userId: context.userId, sessionId: context.sessionId, messages });
    }

    // token 预算硬限制：防止上下文溢出
    messages = ctxEngine.enforceBudget(messages);

    const openaiTools = registry.toOpenAITools();
    const response = await modelRouter.chatWithTools(messages, openaiTools, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      taskType: 'main_chat',
    });

    // 从 API 响应更新真实 token 计数
    ctxEngine.updateFromResponse(response.usage);

    const msg = response.message;

    // 模型返回文本（不再调用工具）
    if (msg.content && !msg.tool_calls?.length) {
      if (hooks) {
        await hooks.emit('agent:end', {
          userId: context.userId, sessionId: context.sessionId,
          response: msg.content, iterations: iteration + 1,
          toolsUsed: [...toolsUsed],
        });
      }
      return {
        content: msg.content,
        iterations: iteration + 1,
        toolsUsed: [...toolsUsed],
        totalTokensUsed: ctxEngine.sessionTotalTokens,
      };
    }

    // 模型请求调用工具
    if (msg.tool_calls?.length) {
      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      } as unknown as ChatMessage);

      // 解析所有工具调用参数，过滤重复
      const parsedCalls: Array<{
        tc: ToolCallRequest;
        name: string;
        args: Record<string, unknown>;
        hash: string;
        skippedReason?: string;
      }> = [];

      for (const tc of msg.tool_calls) {
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(tc.function.arguments);
        } catch {
          try {
            const repaired = tc.function.arguments.replace(/,(\s*[\]}])/g, '$1');
            toolArgs = JSON.parse(repaired);
          } catch {
            toolArgs = {};
          }
        }

        const hash = `${tc.function.name}:${JSON.stringify(toolArgs)}`;
        const count = (toolCallHistory.get(hash) || 0) + 1;
        toolCallHistory.set(hash, count);

        if (count >= 3) {
          parsedCalls.push({ tc, name: tc.function.name, args: toolArgs, hash, skippedReason: '重复调用' });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '该工具已重复调用多次，请尝试其他方法或基于已有信息给出回答。',
          } as unknown as ChatMessage);
        } else {
          parsedCalls.push({ tc, name: tc.function.name, args: toolArgs, hash });
        }
      }

      // 使用并行化器分组：并行安全的工具可并发执行
      const activeCalls = parsedCalls.filter(c => !c.skippedReason);
      const grouped = groupToolCallsForExecution(activeCalls.map(c => c.tc));

      // 执行工具（按分组：并行组内并发，串行组逐个执行）
      async function executeOne(call: typeof parsedCalls[0]): Promise<void> {
        const toolName = call.name;
        const toolArgs = call.args;
        const tc = call.tc;

        const toolStartTime = Date.now();
        if (hooks) {
          await hooks.emit('pre_tool_call', {
            userId: context.userId, sessionId: context.sessionId,
            toolName, toolArgs,
          });
        }

        const tool = registry.get(toolName);
        const result = tool
          ? await executeWithTimeoutAndRecovery(
              toolName,
              tool.handler,
              toolArgs,
              { userId: context.userId, sessionId: context.sessionId, signal: context.signal, presets: context.presets },
              { timeoutMs: toolTimeout, isLongRunning: tool.isLongRunning }
            )
          : { success: false, output: '', error: `未找到工具: ${toolName}` };

        toolsUsed.add(toolName);

        if (hooks) {
          await hooks.emit('post_tool_call', {
            userId: context.userId, sessionId: context.sessionId,
            toolName, toolArgs, toolResult: result,
            toolDuration: Date.now() - toolStartTime,
          });
        }

        const truncatedOutput = result.success
          ? (result.output.length > 2000 ? result.output.substring(0, 2000) + '\n...(内容已截断)' : result.output)
          : `工具执行失败: ${result.error || '未知错误'}`;

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncatedOutput,
        } as unknown as ChatMessage);
      }

      // 执行并行组（组内并发）
      for (const group of grouped.parallel) {
        const groupCalls = group.map(tc => activeCalls.find(c => c.tc.id === tc.id)!).filter(Boolean);
        await Promise.all(groupCalls.map(c => executeOne(c)));
      }

      // 执行串行工具（逐个）
      for (const tc of grouped.serial) {
        const call = activeCalls.find(c => c.tc.id === tc.id);
        if (call) await executeOne(call);
      }

      // 更新计划进度
      if (plan) {
        plan = updatePlanProgress(plan, [...toolsUsed]);
      }

      // 上下文压缩（使用 ContextEngine）
      if (iteration >= 3 && ctxEngine.shouldCompress(messages)) {
        const compressed = await ctxEngine.compress(messages);
        messages.length = 0;
        for (const m of compressed) messages.push(m);
      }
    } else {
      // 没有 tool_calls 也没有 content — 异常
      if (hooks) {
        await hooks.emit('agent:end', {
          userId: context.userId, sessionId: context.sessionId,
          response: msg.content || '无法处理该请求，请换个方式提问。',
          iterations: iteration + 1,
          toolsUsed: [...toolsUsed],
        });
      }
      return {
        content: msg.content || '无法处理该请求，请换个方式提问。',
        iterations: iteration + 1,
        toolsUsed: [...toolsUsed],
        totalTokensUsed: ctxEngine.sessionTotalTokens,
      };
    }

    iteration++;
  }

  // 达到最大迭代：强制最终总结
  messages.push({
    role: 'user',
    content: '请基于以上所有工具调用结果和对话内容，给出最终回答。直接输出内容，不要再调用工具。',
  } as ChatMessage);

  try {
    const finalContent = await modelRouter.chat(messages, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      taskType: 'main_chat',
    });
    if (hooks) {
      await hooks.emit('agent:end', {
        userId: context.userId, sessionId: context.sessionId,
        response: finalContent, iterations: maxIter,
        toolsUsed: [...toolsUsed],
      });
    }
    return {
      content: finalContent,
      iterations: maxIter,
      toolsUsed: [...toolsUsed],
      totalTokensUsed: ctxEngine.sessionTotalTokens,
    };
  } catch {
    if (hooks) {
      await hooks.emit('agent:end', {
        userId: context.userId, sessionId: context.sessionId,
        response: '已达到最大思考步骤。请简化问题后重试。',
        iterations: maxIter,
        toolsUsed: [...toolsUsed],
      });
    }
    return {
      content: '已达到最大思考步骤。请简化问题后重试。',
      iterations: maxIter,
      toolsUsed: [...toolsUsed],
      totalTokensUsed: ctxEngine.sessionTotalTokens,
    };
  }
}
