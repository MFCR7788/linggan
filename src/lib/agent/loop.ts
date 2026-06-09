// Agent Loop — ReAct 模式多轮执行
// Reasoning + Acting: 模型决定调用工具 → 执行 → 结果注入 → 继续 → 最终输出

import type { ChatMessage } from '@/lib/ai/types';
import type { ToolRegistry } from './tools/registry';
import type { AgentConfig, ToolResult } from './types';
import { callDeepSeekWithTools, callDeepSeek } from '@/lib/ai-services';
import { DEFAULT_AGENT_CONFIG } from './types';
import { compressHistory } from '@/lib/assistant/context-compressor';

interface AgentLoopResult {
  content: string;
  iterations: number;
  toolsUsed: string[];
  totalTokensUsed: number;
}

export async function agentLoop(
  messages: ChatMessage[],
  registry: ToolRegistry,
  context: { userId: string; sessionId?: string; signal?: AbortSignal },
  config: AgentConfig = DEFAULT_AGENT_CONFIG
): Promise<AgentLoopResult> {
  const toolsUsed = new Set<string>();
  const toolCallHistory = new Map<string, number>(); // toolName+paramsHash → count
  let totalTokens = 0;
  let iteration = 0;
  const maxIter = config.maxIterations || 10;

  while (iteration < maxIter) {
    if (context.signal?.aborted) {
      return { content: '执行已取消。', iterations: iteration, toolsUsed: [...toolsUsed], totalTokensUsed: totalTokens };
    }

    const openaiTools = registry.toOpenAITools();
    const response = await callDeepSeekWithTools(messages, openaiTools, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    totalTokens++;

    const msg = response.message;

    // 模型返回文本（不再调用工具）
    if (msg.content && !msg.tool_calls?.length) {
      return {
        content: msg.content,
        iterations: iteration + 1,
        toolsUsed: [...toolsUsed],
        totalTokensUsed: totalTokens,
      };
    }

    // 模型请求调用工具
    if (msg.tool_calls?.length) {
      // 将 assistant 消息（带 tool_calls）加入历史
      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      } as unknown as ChatMessage);

      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let toolArgs: Record<string, unknown>;

        try {
          toolArgs = JSON.parse(tc.function.arguments);
        } catch {
          toolArgs = {};
        }

        // 防同参数死循环：同一工具+参数连续 3 次 → 跳过
        const hash = `${toolName}:${JSON.stringify(toolArgs)}`;
        const count = (toolCallHistory.get(hash) || 0) + 1;
        toolCallHistory.set(hash, count);
        if (count >= 3) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '该工具已重复调用多次，请尝试其他方法或基于已有信息给出回答。',
          } as unknown as ChatMessage);
          continue;
        }

        // 执行工具
        const result: ToolResult = await registry.execute(toolName, toolArgs, {
          userId: context.userId,
          sessionId: context.sessionId,
          signal: context.signal,
        });

        toolsUsed.add(toolName);

        // 截断输出防止 context 溢出
        const truncatedOutput = result.success
          ? (result.output.length > 2000 ? result.output.substring(0, 2000) + '\n...(内容已截断)' : result.output)
          : `工具执行失败: ${result.error || '未知错误'}`;

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncatedOutput,
        } as unknown as ChatMessage);
      }

      // 多轮后触发压缩
      if (iteration >= 3 && messages.length > 20) {
        const { compressedSummary, recentMessages } = await compressHistory(
          messages.filter((m) => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>
        );
        if (compressedSummary) {
          // 保留 system prompt，替换其余为压缩版本
          const systemMsg = messages.find((m) => m.role === 'system');
          messages.length = 0;
          if (systemMsg) messages.push(systemMsg);
          messages.push({ role: 'user', content: `[对话历史摘要]\n${compressedSummary}` } as ChatMessage);
          for (const rm of recentMessages) {
            messages.push(rm as ChatMessage);
          }
        }
      }
    } else {
      // 没有 tool_calls 也没有 content — 异常情况
      return {
        content: msg.content || '无法处理该请求，请换个方式提问。',
        iterations: iteration + 1,
        toolsUsed: [...toolsUsed],
        totalTokensUsed: totalTokens,
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
    const finalContent = await callDeepSeek(messages.map((m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${m.role}: ${content}`;
    }).join('\n\n'), { temperature: config.temperature, maxTokens: config.maxTokens });
    return {
      content: finalContent,
      iterations: maxIter,
      toolsUsed: [...toolsUsed],
      totalTokensUsed: totalTokens + 1,
    };
  } catch {
    return {
      content: '已达到最大思考步骤。请简化问题后重试。',
      iterations: maxIter,
      toolsUsed: [...toolsUsed],
      totalTokensUsed: totalTokens,
    };
  }
}
