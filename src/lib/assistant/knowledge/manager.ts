// KnowledgeManager — 编排多个知识源
// 按 priority 排序执行，收集结果直到足够

import type { KnowledgeProvider } from './provider';
import type { KnowledgeResult, SearchOptions } from '../types';

const DEFAULT_MIN_RESULTS = 3;

export class KnowledgeManager {
  private providers: KnowledgeProvider[] = [];

  addProvider(provider: KnowledgeProvider): void {
    this.providers.push(provider);
  }

  /** 串行搜索所有知识源，直到收集足够结果 */
  async search(
    query: string,
    embedding: number[],
    userId?: string,
    minResults: number = DEFAULT_MIN_RESULTS
  ): Promise<{
    results: KnowledgeResult[];
    sources: string[];
    fellBackToWeb: boolean;
  }> {
    const results: KnowledgeResult[] = [];
    const sources: string[] = [];
    let fellBackToWeb = false;

    const sorted = [...this.providers].sort((a, b) => a.priority - b.priority);
    const opts: SearchOptions = {
      limit: 5,
      similarityThreshold: 0.7,
      userId,
    };

    for (const provider of sorted) {
      try {
        if (!(await provider.isAvailable())) continue;

        const providerResults = await provider.search(query, embedding, opts);
        if (providerResults.length > 0) {
          results.push(...providerResults);
          sources.push(provider.name);
        }

        // 非联网搜索 Provider 收集到足够结果就停止
        if (provider.name !== 'web-search' && results.length >= minResults) {
          break;
        }

        // 标记是否走到了联网搜索
        if (provider.name === 'web-search') {
          fellBackToWeb = true;
        }
      } catch (e) {
        console.warn(`Knowledge provider '${provider.name}' 搜索失败:`, e);
      }
    }

    return { results: deduplicate(results).slice(0, 10), sources, fellBackToWeb };
  }

  get providerNames(): string[] {
    return this.providers.map(p => p.name);
  }
}

function deduplicate(results: KnowledgeResult[]): KnowledgeResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    const key = r.id || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
