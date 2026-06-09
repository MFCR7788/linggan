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

    // 分离 web-search 和其他 provider，非 web 的可并行
    const webProviders = sorted.filter(p => p.name === 'web-search');
    const localProviders = sorted.filter(p => p.name !== 'web-search');

    // 并行执行本地 provider（灵感库 + 公共知识）
    const localResults = await Promise.allSettled(
      localProviders.map(async (provider) => {
        if (!(await provider.isAvailable())) return [];
        try {
          return await provider.search(query, embedding, opts);
        } catch (e) {
          console.warn(`Knowledge provider '${provider.name}' 搜索失败:`, e);
          return [];
        }
      })
    );

    for (let i = 0; i < localProviders.length; i++) {
      const r = localResults[i];
      if (r.status === 'fulfilled' && r.value.length > 0) {
        results.push(...r.value);
        sources.push(localProviders[i].name);
      }
    }

    // 本地结果不够才走联网搜索
    if (results.length < minResults) {
      for (const provider of webProviders) {
        try {
          if (!(await provider.isAvailable())) continue;
          const providerResults = await provider.search(query, embedding, opts);
          if (providerResults.length > 0) {
            results.push(...providerResults);
            sources.push(provider.name);
          }
          fellBackToWeb = true;
        } catch (e) {
          console.warn(`Knowledge provider '${provider.name}' 搜索失败:`, e);
        }
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
