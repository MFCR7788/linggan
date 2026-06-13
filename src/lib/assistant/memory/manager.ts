// MemoryManager — 编排所有 MemoryProvider
// 内置 Provider 始终存在，外部 Provider 通过插件方式注册

import type { MemoryEntry, MemoryProvider, MemorySearchResult } from '../types';
import type { ChatMessage } from '@/lib/ai/types';
import { buildMemoryContextBlock } from './provider';

export class MemoryManager {
  private providers: MemoryProvider[] = [];
  private initialized = false;

  addProvider(provider: MemoryProvider): void {
    if (this.providers.some(p => p.name === provider.name)) {
      console.warn(`Memory provider '${provider.name}' 已注册，跳过`);
      return;
    }
    this.providers.push(provider);
  }

  async initialize(userId: string): Promise<void> {
    for (const p of this.providers) {
      try {
        if (await p.isAvailable()) {
          await p.initialize(userId);
        }
      } catch (e) {
        console.warn(`Memory provider '${p.name}' 初始化失败:`, e);
      }
    }
    this.initialized = true;
  }

  buildSystemPrompt(): string {
    const blocks: string[] = [];
    for (const p of this.providers) {
      try {
        if (p.systemPromptBlock) {
          const block = p.systemPromptBlock();
          if (block) blocks.push(block);
        }
      } catch (e) { /* skip */ }
    }
    return blocks.join('\n\n');
  }

  async prefetchAll(query: string, embedding: number[]): Promise<string> {
    const parts: string[] = [];
    for (const p of this.providers) {
      try {
        if (!(await p.isAvailable())) continue;
        const results = await p.prefetch(query, embedding);
        if (results.length > 0) {
          const block = results
            .map(r => `[${r.category}] relevance=${r.similarity.toFixed(2)}\n${r.value}`)
            .join('\n\n---\n\n');
          parts.push(block);
        }
      } catch (e) {
        console.warn(`Memory provider '${p.name}' prefetch 失败:`, e);
      }
    }
    const raw = parts.join('\n\n');
    return buildMemoryContextBlock(raw);
  }

  async syncAll(userContent: string, assistantContent: string, sessionId?: string): Promise<void> {
    for (const p of this.providers) {
      try {
        if (!(await p.isAvailable())) continue;
        if (p.onSessionEnd) {
          // 每轮对话后提取记忆：构造临时消息列表传入 provider 的提取器
          const messages: ChatMessage[] = [
            { role: 'user', content: userContent } as ChatMessage,
            { role: 'assistant', content: assistantContent } as ChatMessage,
          ];
          await p.onSessionEnd(sessionId || '', messages);
        }
      } catch (e) {
        console.warn(`Memory provider '${p.name}' sync 失败:`, e);
      }
    }
  }

  /** 会话结束时提取并持久化长期记忆（异步，不阻塞） */
  async onSessionEnd(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const results = await Promise.allSettled(
      this.providers.map(async (p) => {
        if (!(await p.isAvailable())) return;
        if (p.onSessionEnd) {
          await p.onSessionEnd(sessionId, messages);
        }
      })
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        console.warn(`Memory provider '${this.providers[i].name}' onSessionEnd 失败:`, (results[i] as PromiseRejectedResult).reason);
      }
    }
  }

  async saveEntry(
    userId: string,
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<MemoryEntry | null> {
    for (const p of this.providers) {
      try {
        if (await p.isAvailable()) return await p.save(entry);
      } catch { /* try next */ }
    }
    return null;
  }

  async shutdown(): Promise<void> {
    for (const p of this.providers) {
      try {
        if (p.shutdown) await p.shutdown();
      } catch { /* skip */ }
    }
  }

  get providerNames(): string[] {
    return this.providers.map(p => p.name);
  }
}
