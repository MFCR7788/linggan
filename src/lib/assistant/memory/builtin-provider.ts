// BuiltinMemoryProvider — 基于 Supabase pgvector 的内置记忆 Provider
// 使用 user_memories 表持久化，search_user_memories 函数做向量检索

import type { MemoryProvider, MemoryEntry, MemorySearchResult } from '../types';
import { createAdminClient } from '@/lib/supabase-server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export class BuiltinMemoryProvider implements MemoryProvider {
  readonly name = 'builtin';
  private userId = '';
  private available = false;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    this.available = !!(SUPABASE_URL && userId);
  }

  async prefetch(query: string, embedding: number[]): Promise<MemorySearchResult[]> {
    if (!this.available) return [];

    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc('search_user_memories', {
        p_user_id: this.userId,
        p_query_embedding: embedding,
        p_limit: 5,
        p_similarity_threshold: 0.7,
      });

      if (error) {
        console.warn('[Memory] 向量搜索失败:', error.message);
        return [];
      }

      return (data || []) as MemorySearchResult[];
    } catch (e) {
      console.warn('[Memory] prefetch 异常:', e);
      return [];
    }
  }

  async save(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    if (!this.available) throw new Error('Memory provider 未初始化');

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('user_memories')
      .insert({
        user_id: entry.userId,
        category: entry.category,
        key: entry.key || null,
        value: entry.value,
        importance: entry.importance,
        source_session_id: entry.sourceSessionId || null,
        embedding: entry.embedding || null,
      })
      .select()
      .single();

    if (error) throw new Error(`保存记忆失败: ${error.message}`);
    return mapRow(data);
  }

  async update(
    id: string,
    patch: Partial<Pick<MemoryEntry, 'value' | 'importance' | 'category'>>
  ): Promise<void> {
    if (!this.available) throw new Error('Memory provider 未初始化');

    const supabase = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.value !== undefined) updates.value = patch.value;
    if (patch.importance !== undefined) updates.importance = patch.importance;
    if (patch.category !== undefined) updates.category = patch.category;

    const { error } = await supabase
      .from('user_memories')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw new Error(`更新记忆失败: ${error.message}`);
  }

  async delete(id: string): Promise<void> {
    if (!this.available) throw new Error('Memory provider 未初始化');

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('user_memories')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw new Error(`删除记忆失败: ${error.message}`);
  }

  async getByCategory(category: string): Promise<MemoryEntry[]> {
    if (!this.available) return [];

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', this.userId)
      .eq('category', category)
      .order('importance', { ascending: false })
      .limit(20);

    return (data || []).map(mapRow);
  }

  async getAll(): Promise<MemoryEntry[]> {
    if (!this.available) return [];

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', this.userId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    return (data || []).map(mapRow);
  }

  systemPromptBlock(): string {
    return (
      '[内置记忆] 你可以使用记忆系统来记住关于用户的重要事实、偏好和工作流。\n' +
      '每次对话后，检查是否有值得持久化的新信息（用户说了什么关于自己的事、偏好变化、' +
      '重复出现的工作模式等），写入 user_memories。'
    );
  }
}

function mapRow(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: (row.category as MemoryEntry['category']) || 'general',
    key: row.key as string | undefined,
    value: row.value as string,
    importance: (row.importance as number) || 1,
    sourceSessionId: row.source_session_id as string | undefined,
    embedding: row.embedding as number[] | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
