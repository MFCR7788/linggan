// SupabaseRepository — Repository<T> 的 Supabase 实现

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repository } from './base';

export class SupabaseRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    private table: string,
    private supabase: SupabaseClient
  ) {}

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // 0 rows
      throw error;
    }
    return data as T;
  }

  async findMany(query: Record<string, unknown> = {}): Promise<T[]> {
    let builder = this.supabase.from(this.table).select('*');

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        builder = builder.eq(key, value);
      }
    }

    const { data, error } = await builder;
    if (error) throw error;
    return (data || []) as T[];
  }

  async create(data: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const { data: created, error } = await this.supabase
      .from(this.table)
      .insert(data as Record<string, unknown>)
      .select()
      .single();

    if (error) throw error;
    return created as T;
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const { data: updated, error } = await this.supabase
      .from(this.table)
      .update(data as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated as T;
  }

  async upsert(data: T): Promise<T> {
    const { data: result, error } = await this.supabase
      .from(this.table)
      .upsert(data as Record<string, unknown>)
      .select()
      .single();

    if (error) throw error;
    return result as T;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async count(query: Record<string, unknown> = {}): Promise<number> {
    let builder = this.supabase.from(this.table).select('*', { count: 'exact', head: true });

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        builder = builder.eq(key, value);
      }
    }

    const { count, error } = await builder;
    if (error) throw error;
    return count ?? 0;
  }
}
