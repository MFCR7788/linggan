// LongTermMemoryProvider — 实现 MemoryProvider 接口
// SQLite 为热缓存，Supabase 为主存储（数据持久化）
// 读：SQLite FTS5 优先 → Supabase pgvector fallback
// 写：双写 Supabase + SQLite
// 初始化：SQLite 为空时从 Supabase 拉取基准数据

import type { MemoryProvider, MemoryEntry, MemorySearchResult } from '@/lib/assistant/types';
import type { ChatMessage } from '@/lib/ai/types';
import { createAdminClient } from '@/lib/supabase-server';
import { getLongTermMemoryStore } from './store';
import { getMemoryExtractor } from './extractor';
import { generateEmbedding } from '@/lib/assistant/embedding';
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
    this.available = true;

    // SQLite 为空时从 Supabase 拉取基准数据
    try {
      await this.syncFromSupabaseIfNeeded();
    } catch (e) {
      console.warn('[LongTermMemory] 初始化同步失败:', e);
    }
  }

  // ====== 从 Supabase 同步基准数据到 SQLite 缓存 ======

  private async syncFromSupabaseIfNeeded(): Promise<void> {
    const store = getLongTermMemoryStore();
    const existing = store.getByUser(this.userId, 3, 1);
    if (existing.length > 0) return;

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', this.userId)
      .order('importance', { ascending: false })
      .limit(200);

    if (!data || data.length === 0) return;

    const rows = data as Array<Record<string, unknown>>;
    for (const row of rows) {
      try {
        const memType = mapCategoryToType((row.category as string) || 'general');
        store.insert(
          row.user_id as string,
          memType,
          row.value as string,
          (row.importance as number) || 1,
          row.source_session_id as string || undefined
        );
      } catch {
        // skip individual insert failures
      }
    }
    console.log(`[LongTermMemory] 从 Supabase 同步 ${rows.length} 条记忆到本地缓存`);
  }

  // ====== 搜索（SQLite 优先 → Supabase fallback） ======

  async prefetch(query: string, embedding: number[]): Promise<MemorySearchResult[]> {
    if (!this.available) return [];

    // 1. SQLite FTS5 本地搜索（快）
    try {
      const store = getLongTermMemoryStore();
      const localResults = store.search({
        userId: this.userId,
        query,
        limit: 10,
        minImportance: 3,
      });

      if (localResults.length > 0) {
        return localResults.map((m) => ({
          id: `ltm_${m.id}`,
          category: mapTypeToCategory(m.type),
          value: m.content,
          importance: m.importance,
          similarity: 0.85,
        }));
      }
    } catch (e) {
      console.warn('[LongTermMemory] SQLite 搜索失败:', e);
    }

    // 2. Supabase pgvector fallback（持久化保证）
    if (embedding.length > 0) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc('search_user_memories', {
          p_user_id: this.userId,
          p_query_embedding: embedding,
          p_limit: 10,
          p_similarity_threshold: 0.7,
        });

        if (!error && data?.length) {
          return (data as Array<Record<string, unknown>>).map((r) => ({
            id: `supa_${r.id}`,
            category: (r.category as MemoryEntry['category']) || 'general',
            value: r.value as string,
            importance: (r.importance as number) || 1,
            similarity: (r.similarity as number) || 0.8,
          }));
        }
      } catch (e) {
        console.warn('[LongTermMemory] Supabase fallback 失败:', e);
      }
    }

    return [];
  }

  // ====== CRUD ======

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

  async getByCategory(category: string): Promise<MemoryEntry[]> {
    if (!this.available) return [];

    // SQLite 优先
    const store = getLongTermMemoryStore();
    const memType = mapCategoryToType(category as MemoryEntry['category']);
    const localResults = store.getByUser(this.userId, 20, 1, memType);

    if (localResults.length > 0) {
      return localResults.map(mapToEntry);
    }

    // Supabase fallback
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', this.userId)
        .eq('category', category)
        .order('importance', { ascending: false })
        .limit(20);

      if (data?.length) {
        return (data as Array<Record<string, unknown>>).map(mapSupabaseRow);
      }
    } catch (e) {
      console.warn('[LongTermMemory] Supabase getByCategory 失败:', e);
    }

    return [];
  }

  async getAll(): Promise<MemoryEntry[]> {
    if (!this.available) return [];

    // SQLite 优先
    const store = getLongTermMemoryStore();
    const localResults = store.getByUser(this.userId, 50, 1);

    if (localResults.length > 0) {
      return localResults.map(mapToEntry);
    }

    // Supabase fallback
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', this.userId)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (data?.length) {
        return (data as Array<Record<string, unknown>>).map(mapSupabaseRow);
      }
    } catch (e) {
      console.warn('[LongTermMemory] Supabase getAll 失败:', e);
    }

    return [];
  }

  // ====== 会话结束：双写 Supabase + SQLite ======

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

      if (results.length === 0) return;

      const store = getLongTermMemoryStore();
      const supabase = createAdminClient();

      for (const r of results) {
        // 1. SQLite 本地缓存（快）
        store.insert(this.userId, r.type, r.content, r.importance, sessionId);

        // 2. Supabase 主存储（持久化）
        const category = mapTypeToCategory(r.type);
        let embedding: number[] | undefined;
        try {
          embedding = await generateEmbedding(r.content);
        } catch {
          /* skip */
        }

        await supabase.from('user_memories').insert({
          user_id: this.userId,
          category,
          value: r.content,
          importance: r.importance,
          source_session_id: sessionId,
          embedding: embedding || null,
        });
      }

      console.log(`[LongTermMemory] 双写 ${results.length} 条记忆 (session: ${sessionId})`);
    } catch (e) {
      console.warn('[LongTermMemory] onSessionEnd 失败:', e);
    }
  }

  systemPromptBlock(): string {
    // 记忆通过 prefetch 动态注入，不返回静态 block
    return '';
  }

  async shutdown(): Promise<void> {
    try {
      getLongTermMemoryStore().close();
    } catch {
      // ignore
    }
  }
}

// ====== 映射工具函数 ======

function mapTypeToCategory(type: LongTermMemoryType): MemoryEntry['category'] {
  switch (type) {
    case 'preference':
      return 'preference';
    case 'fact':
      return 'fact';
    case 'workflow':
      return 'workflow';
    case 'style':
      return 'preference';
    default:
      return 'general';
  }
}

function mapCategoryToType(category: string): LongTermMemoryType {
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

function mapToEntry(m: {
  id: number;
  user_id: string;
  type: LongTermMemoryType;
  content: string;
  importance: number;
  source_session_id: string | null;
  created_at: string;
  last_accessed_at: string;
}): MemoryEntry {
  return {
    id: `ltm_${m.id}`,
    userId: m.user_id,
    category: mapTypeToCategory(m.type),
    key: undefined,
    value: m.content,
    importance: m.importance,
    sourceSessionId: m.source_session_id || undefined,
    createdAt: m.created_at,
    updatedAt: m.last_accessed_at,
  };
}

function mapSupabaseRow(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: (row.category as MemoryEntry['category']) || 'general',
    key: row.key as string | undefined,
    value: row.value as string,
    importance: (row.importance as number) || 1,
    sourceSessionId: row.source_session_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
