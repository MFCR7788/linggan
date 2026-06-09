// 联网搜索 Provider — 知识库无结果时的回退
// priority = 9（最低优先级，最后尝试）
// 使用 aggregateSearch 真实搜索多个中文平台

import type { KnowledgeProvider } from './provider';
import type { KnowledgeResult, SearchOptions } from '../types';
import { aggregateSearch } from '@/lib/search/aggregator';

export class WebSearchProvider implements KnowledgeProvider {
  readonly name = 'web-search';
  readonly priority = 9;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async search(query: string, _embedding: number[], _opts: SearchOptions): Promise<KnowledgeResult[]> {
    try {
      const { results } = await aggregateSearch(query, {
        sources: ['baidu', 'sogou', 'bing', 'weibo'],
        maxResults: 5,
        sourceTimeout: 5000,
      });

      if (results.length === 0) return [];

      return results.slice(0, 5).map((r, i) => ({
        id: `web-${Date.now()}-${i}`,
        title: r.title || '搜索结果',
        content: r.content || r.title || '',
        source: r.source || '联网搜索',
        similarity: 0.85,
      }));
    } catch (e) {
      console.warn('[WebSearch] 搜索失败:', e);
      return [];
    }
  }
}
