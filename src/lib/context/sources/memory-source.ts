// MemorySource — 记忆检索上下文来源

import type { ContextSource, ContextInput, ContextChunk } from '../assembler';
import type { MemoryManager } from '@/lib/assistant/memory/manager';
import { generateEmbedding } from '@/lib/assistant/embedding';

export class MemorySource implements ContextSource {
  readonly name = 'memory';
  readonly priority = 10;

  private manager: MemoryManager;

  constructor(manager: MemoryManager) {
    this.manager = manager;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetch(input: ContextInput): Promise<ContextChunk | null> {
    try {
      const embedding = await generateEmbedding(input.userMessage).catch(() => [] as number[]);
      const block = await this.manager.prefetchAll(input.userMessage, embedding).catch(() => '');

      if (!block) return null;

      return {
        source: this.name,
        promptBlock: `## 用户记忆\n${block}`,
        priority: this.priority,
        raw: 1, // count of memory blocks used
      };
    } catch {
      return null;
    }
  }
}
