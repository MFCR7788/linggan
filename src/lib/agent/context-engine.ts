// ContextEngine — 统一 token 计数 + 上下文压缩
// 替换 agent loop 中的 totalTokens++ 占位符
// 管理上下文长度，超过阈值触发压缩

import type { ChatMessage } from '@/lib/ai/types';
import { compressHistory } from '@/lib/assistant/context-compressor';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextEngineConfig {
  /** token 阈值（占比），超过则触发压缩。默认 0.75 */
  thresholdRatio?: number;
  /** 上下文窗口大小（token 数），默认 128K (DeepSeek-V3) */
  contextWindow?: number;
  /** 压缩触发的最小消息数 */
  minMessagesToCompress?: number;
}

export class ContextEngine {
  /** 上一次请求的 token 用量 */
  lastPromptTokens = 0;
  lastCompletionTokens = 0;
  lastTotalTokens = 0;

  /** 会话累计 token */
  sessionPromptTokens = 0;
  sessionCompletionTokens = 0;

  /** 压缩次数 */
  compressionCount = 0;

  private config: Required<ContextEngineConfig>;

  constructor(config: ContextEngineConfig = {}) {
    this.config = {
      thresholdRatio: config.thresholdRatio ?? 0.75,
      contextWindow: config.contextWindow ?? 131072,
      minMessagesToCompress: config.minMessagesToCompress ?? 20,
    };
  }

  /** 从 API 响应更新 token 计数 */
  updateFromResponse(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): void {
    if (!usage) return;
    this.lastPromptTokens = usage.prompt_tokens ?? 0;
    this.lastCompletionTokens = usage.completion_tokens ?? 0;
    this.lastTotalTokens = usage.total_tokens ?? 0;
    this.sessionPromptTokens += this.lastPromptTokens;
    this.sessionCompletionTokens += this.lastCompletionTokens;
  }

  /** 估算消息列表的 token 数（粗略估算：1 token ≈ 3 字符） */
  estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += Math.ceil(content.length / 3);
      // tool_calls 的 token 消耗
      if ('tool_calls' in msg && msg.tool_calls) {
        total += Math.ceil(JSON.stringify(msg.tool_calls).length / 3);
      }
    }
    return total;
  }

  /** 是否应该触发上下文压缩 */
  shouldCompress(messages: ChatMessage[]): boolean {
    if (messages.length < this.config.minMessagesToCompress) return false;
    const estimatedTokens = this.estimateTokens(messages);
    const threshold = Math.floor(this.config.contextWindow * this.config.thresholdRatio);
    return estimatedTokens > threshold;
  }

  /** 执行上下文压缩 */
  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const nonSystem = messages.filter(
      (m) => m.role !== 'system'
    ) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const { compressedSummary, recentMessages } = await compressHistory(nonSystem);

    const systemMsg = messages.find((m) => m.role === 'system');
    const result: ChatMessage[] = [];

    if (systemMsg) result.push(systemMsg);
    if (compressedSummary) {
      result.push({
        role: 'user',
        content: `[对话历史摘要]\n${compressedSummary}`,
      } as ChatMessage);
    }
    for (const rm of recentMessages) {
      result.push(rm as ChatMessage);
    }

    this.compressionCount++;
    return result;
  }

  /** 获取会话 token 总量 */
  get sessionTotalTokens(): number {
    return this.sessionPromptTokens + this.sessionCompletionTokens;
  }

  /** 重置会话计数 */
  resetSession(): void {
    this.sessionPromptTokens = 0;
    this.sessionCompletionTokens = 0;
    this.compressionCount = 0;
  }
}
