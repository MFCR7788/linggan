// KnowledgeSource — 知识库检索上下文来源

import type { ContextSource, ContextInput, ContextChunk } from '../assembler';
import type { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { generateEmbedding } from '@/lib/assistant/embedding';
import type { KnowledgeResult } from '@/lib/assistant/types';

export class KnowledgeSource implements ContextSource {
  readonly name = 'knowledge';
  readonly priority = 20;

  private manager: KnowledgeManager;

  constructor(manager: KnowledgeManager) {
    this.manager = manager;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetch(input: ContextInput): Promise<ContextChunk | null> {
    try {
      const embedding = await generateEmbedding(input.userMessage).catch(() => [] as number[]);
      const { results } = await this.manager.search(input.userMessage, embedding, input.userId, 3);

      if (!results || results.length === 0) return null;

      const kbBlock = results
        .map((r: KnowledgeResult) => `- ${r.title}: ${r.content.substring(0, 500)}`)
        .join('\n');

      return {
        source: this.name,
        promptBlock: `## 知识库\n${kbBlock}`,
        priority: this.priority,
        raw: results.length,
      };
    } catch {
      return null;
    }
  }
}
