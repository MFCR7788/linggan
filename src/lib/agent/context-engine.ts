// ContextEngine — 统一 token 计数 + 上下文压缩 + token 预算控制
// 替换 agent loop 中的 totalTokens++ 占位符
// 管理上下文长度，超过阈值触发压缩，超过硬限制强制截断

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
  /** 硬性 token 预算上限（默认 contextWindow * 0.9），超过则强制截断旧消息 */
  maxBudgetTokens?: number;
}

/** 安全的 token 估算：中文约 1.5-2 字符/token，英文约 4 字符/token。用 2 作为混合估算 */
const CHARS_PER_TOKEN = 2;

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

  /** token 预算强制截断次数 */
  truncationCount = 0;

  private config: Required<ContextEngineConfig>;

  constructor(config: ContextEngineConfig = {}) {
    this.config = {
      thresholdRatio: config.thresholdRatio ?? 0.75,
      contextWindow: config.contextWindow ?? 131072,
      minMessagesToCompress: config.minMessagesToCompress ?? 20,
      maxBudgetTokens: config.maxBudgetTokens ?? Math.floor((config.contextWindow ?? 131072) * 0.9),
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

  /**
   * 估算消息列表的 token 数
   * 使用 chars/2 作为混合中英文的粗略估算（纯中文 ~1.5，纯英文 ~4，混合取 2 偏保守）
   */
  estimateTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += Math.ceil(content.length / CHARS_PER_TOKEN);
      // tool_calls 的 token 消耗
      if ('tool_calls' in msg && msg.tool_calls) {
        total += Math.ceil(JSON.stringify(msg.tool_calls).length / CHARS_PER_TOKEN);
      }
    }
    // 每条消息约 4 token 的格式开销（role, 分隔符等）
    total += messages.length * 4;
    return total;
  }

  /** 是否应该触发上下文压缩 */
  shouldCompress(messages: ChatMessage[]): boolean {
    if (messages.length < this.config.minMessagesToCompress) return false;
    const estimatedTokens = this.estimateTokens(messages);
    const threshold = Math.floor(this.config.contextWindow * this.config.thresholdRatio);
    return estimatedTokens > threshold;
  }

  /**
   * 强制 token 预算：确保消息总 token 数不超过 maxBudgetTokens
   * 从最早的非 system 消息开始移除，保留 system prompt 和最近的消息
   */
  enforceBudget(messages: ChatMessage[]): ChatMessage[] {
    const budget = this.config.maxBudgetTokens;
    const estimated = this.estimateTokens(messages);

    if (estimated <= budget) return messages;

    // 分离 system 消息（必须保留）
    const systemMsgs = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const systemTokens = this.estimateTokens(systemMsgs);
    let available = budget - systemTokens;
    if (available <= 0) {
      // system prompt 本身就超预算 — 异常情况，仍然保留 system + 最后一条 user 消息
      this.truncationCount++;
      console.warn(`[ContextEngine] system prompt 自身 ${systemTokens} tokens 已超过预算 ${budget}，强制截断`);
      const lastUser = nonSystem.filter(m => m.role === 'user').slice(-1);
      return [...systemMsgs, ...lastUser];
    }

    // 从后往前保留，直到超出预算
    const kept: ChatMessage[] = [];
    let usedTokens = 0;

    for (let i = nonSystem.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens([nonSystem[i]]);
      if (usedTokens + msgTokens > available) break;
      kept.unshift(nonSystem[i]);
      usedTokens += msgTokens;
    }

    this.truncationCount++;
    console.warn(
      `[ContextEngine] token 预算截断: ${nonSystem.length} → ${kept.length} 条消息 (${estimated} → ${systemTokens + usedTokens} tokens, 预算 ${budget})`
    );

    return [...systemMsgs, ...kept];
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

    // 压缩后仍然可能超预算，再做一次强制截断
    return this.enforceBudget(result);
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
    this.truncationCount = 0;
  }
}
