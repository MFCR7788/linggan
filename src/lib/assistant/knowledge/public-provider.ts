// 公共知识库 Provider — 平台级共享知识
// priority = 2

import type { KnowledgeProvider } from './provider';
import type { KnowledgeResult, SearchOptions } from '../types';
import { createAdminClient } from '@/lib/supabase-server';

export class PublicKnowledgeProvider implements KnowledgeProvider {
  readonly name = 'public-knowledge-base';
  readonly priority = 2;

  async isAvailable(): Promise<boolean> {
    return true; // 始终可用（无结果时返回空）
  }

  async search(_query: string, embedding: number[], opts: SearchOptions): Promise<KnowledgeResult[]> {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc('search_knowledge_base', {
        p_query_embedding: embedding,
        p_limit: opts.limit,
        p_similarity_threshold: opts.similarityThreshold,
      });

      if (error) {
        console.warn('[PublicKB] 搜索失败:', error.message);
        return [];
      }

      return ((data || []) as Record<string, unknown>[]).map(row => ({
        id: row.id as string,
        title: (row.title as string) || '',
        content: (row.content as string) || '',
        category: row.category as string | undefined,
        source: row.source as string | undefined,
        similarity: row.similarity as number,
      }));
    } catch (e) {
      console.warn('[PublicKB] 搜索异常:', e);
      return [];
    }
  }
}
