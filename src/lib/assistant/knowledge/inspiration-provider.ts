// 个人灵感库 Provider — 语义搜索 content_items
// priority = 1（最优先）

import type { KnowledgeProvider } from './provider';
import type { KnowledgeResult, SearchOptions } from '../types';
import { createAdminClient } from '@/lib/supabase-server';

export class InspirationKnowledgeProvider implements KnowledgeProvider {
  readonly name = 'inspiration-library';
  readonly priority = 1;
  private userId = '';

  constructor(userId: string) {
    this.userId = userId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.userId;
  }

  async search(query: string, embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]> {
    if (!this.userId) return [];

    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc('search_inspirations', {
        p_user_id: this.userId,
        p_query_embedding: embedding,
        p_limit: opts.limit,
        p_similarity_threshold: opts.similarityThreshold,
      });

      if (error) {
        console.warn('[InspirationKB] 搜索失败:', error.message);
        return [];
      }

      return ((data || []) as Record<string, unknown>[]).map(mapInspirationResult);
    } catch (e) {
      console.warn('[InspirationKB] 搜索异常:', e);
      return [];
    }
  }
}

function mapInspirationResult(row: Record<string, unknown>): KnowledgeResult {
  return {
    id: row.content_id as string,
    title: (row.title as string) || '未命名灵感',
    content: [
      row.title ? `标题: ${row.title}` : '',
      row.ai_summary ? `摘要: ${row.ai_summary}` : '',
      row.original_text ? `原文: ${(row.original_text as string).slice(0, 300)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    category: row.type as string,
    source: '你的灵感库',
    similarity: row.similarity as number,
  };
}
