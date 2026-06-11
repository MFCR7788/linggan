// LongTermMemoryProvider — 实现 MemoryProvider 接口
// 可插入 MemoryManager，与 BuiltinMemoryProvider 并行工作

import type { MemoryProvider, MemoryEntry, MemorySearchResult } from '@/lib/assistant/types';
import type { ChatMessage } from '@/lib/ai/types';
import { getLongTermMemoryStore } from './store';
import { getMemoryExtractor } from './extractor';
import type { LongTermMemoryType } from './types';

export class LongTermMemoryProvider implements MemoryProvider {
  readonly name = 'long-term';

  private userId = '';
  private available = false;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    // 本地 SQLite 始终可用
    this.available = true;
  }

  async prefetch(_query: string, _embedding: number[]): Promise<MemorySearchResult[]> {
    if (!this.available) return [];

    try {
      const store = getLongTermMemoryStore();
      const memories = store.search({
        userId: this.userId,
        query: _query,
        limit: 10,
        minImportance: 3,
      });

      return memories.map((m) => ({
        id: `ltm_${m.id}`,
        category: mapTypeToCategory(m.type),
        value: m.content,
        importance: m.importance,
        similarity: 0.85, // FTS 结果没有向量相似度，使用固定高分
      }));
    } catch (e) {
      console.warn('[LongTermMemory] prefetch 失败:', e);
      return [];
    }
  }

  async save(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    if (!this.available) throw new Error('LongTermMemoryProvider 未初始化');

    const store = getLongTermMemoryStore();
    const memType = mapCategoryToType(entry.category);

    const result = store.insert(
      entry.userId,
      memType,
      entry.value,
      entry.importance,
      entry.sourceSessionId
    );

    return {
      id: `ltm_${result.id}`,
      userId: result.user_id,
      category: mapTypeToCategory(result.type),
      key: undefined,
      value: result.content,
      importance: result.importance,
      sourceSessionId: result.source_session_id || undefined,
      createdAt: result.created_at,
      updatedAt: result.created_at,
    };
  }

  async update(
    id: string,
    patch: Partial<Pick<MemoryEntry, 'value' | 'importance' | 'category'>>
  ): Promise<void> {
    if (!this.available) throw new Error('LongTermMemoryProvider 未初始化');

    const numericId = extractNumericId(id);
    if (numericId === null) return;

    const store = getLongTermMemoryStore();

    if (patch.importance !== undefined) {
      store.updateImportance(numericId, this.userId, patch.importance);
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.available) throw new Error('LongTermMemoryProvider 未初始化');

    const numericId = extractNumericId(id);
    if (numericId === null) return;

    const store = getLongTermMemoryStore();
    store.delete(numericId, this.userId);
  }

  async onSessionEnd(sessionId: string, messages: ChatMessage[]): Promise<void> {
    if (!this.available) return;

    try {
      const extractor = getMemoryExtractor();

      const extractInput = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

      const results = await extractor.extract({
        userId: this.userId,
        sessionId,
        messages: extractInput,
      });

      if (results.length > 0) {
        const store = getLongTermMemoryStore();
        for (const r of results) {
          store.insert(this.userId, r.type, r.content, r.importance, sessionId);
        }
        console.log(`[LongTermMemory] 提取 ${results.length} 条记忆 (session: ${sessionId})`);
      }
    } catch (e) {
      console.warn('[LongTermMemory] onSessionEnd 失败:', e);
    }
  }

  systemPromptBlock(): string {
    return '';
    // 不返回静态 prompt block，记忆通过 prefetch 动态注入
  }

  async shutdown(): Promise<void> {
    try {
      const store = getLongTermMemoryStore();
      store.close();
    } catch {
      // ignore
    }
  }
}

function mapTypeToCategory(type: LongTermMemoryType): MemoryEntry['category'] {
  switch (type) {
    case 'preference':
      return 'preference';
    case 'fact':
      return 'fact';
    case 'workflow':
      return 'workflow';
    case 'style':
      return 'preference'; // 风格归入偏好
    default:
      return 'general';
  }
}

function mapCategoryToType(category: MemoryEntry['category']): LongTermMemoryType {
  switch (category) {
    case 'preference':
      return 'preference';
    case 'fact':
      return 'fact';
    case 'workflow':
      return 'workflow';
    case 'profile':
      return 'fact';
    default:
      return 'fact';
  }
}

function extractNumericId(id: string): number | null {
  const match = id.match(/^ltm_(\d+)$/);
  return match ? Number(match[1]) : null;
}
