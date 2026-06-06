// 多源搜索聚合器
// 并行请求多个搜索源，统一去重、排序、返回

import { SearchResult } from './types';
import { searchBaiduHot, searchSogou, searchWeibo, searchZhihuHot } from './china-search';
import { searchBing } from './global-search';
import { searchDianping } from './dianping-search';
import { deduplicateResults, prioritizeResults } from './index';

export type SearchSource = 'baidu' | 'sogou' | 'bing' | 'weibo' | 'zhihu' | 'dianping';

export interface AggregateOptions {
  /** 指定搜索源，默认全部 */
  sources?: SearchSource[];
  /** 最大返回条数，默认 20 */
  maxResults?: number;
  /** 单个源超时时间 ms，默认 8000 */
  sourceTimeout?: number;
}

interface SourceResult {
  source: SearchSource;
  results: SearchResult[];
  error?: string;
  durationMs: number;
}

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function fetchSource(
  source: SearchSource,
  query: string,
  timeoutMs: number,
): Promise<SourceResult> {
  const start = Date.now();

  try {
    let results: SearchResult[] = [];

    switch (source) {
      case 'baidu':
        results = await withTimeout(searchBaiduHot(query), timeoutMs);
        break;
      case 'sogou':
        results = await withTimeout(searchSogou(query), timeoutMs);
        break;
      case 'bing':
        results = await withTimeout(searchBing(query), timeoutMs);
        break;
      case 'weibo':
        results = await withTimeout(searchWeibo(query), timeoutMs);
        break;
      case 'zhihu':
        results = await withTimeout(searchZhihuHot(query), timeoutMs);
        break;
      case 'dianping':
        results = await withTimeout(searchDianping(query), timeoutMs);
        break;
    }

    return { source, results, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      source,
      results: [],
      error: e?.message || String(e),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 聚合多源搜索结果
 *
 * @example
 * const { results, sources } = await aggregateSearch('和棠小院 椒江', {
 *   sources: ['baidu', 'dianping', 'weibo'],
 * });
 */
export async function aggregateSearch(
  query: string,
  options: AggregateOptions = {},
): Promise<{
  results: SearchResult[];
  sources: { name: string; count: number; error?: string }[];
}> {
  const sources: SearchSource[] = options.sources || ['baidu', 'sogou', 'bing', 'weibo', 'zhihu', 'dianping'];
  const maxResults = options.maxResults || 20;
  const sourceTimeout = options.sourceTimeout || 8000;

  // 并行请求所有源
  const sourceResults = await Promise.all(
    sources.map((s) => fetchSource(s, query, sourceTimeout)),
  );

  // 汇总
  const allResults: SearchResult[] = [];
  const sourceMeta: { name: string; count: number; error?: string }[] = [];

  for (const sr of sourceResults) {
    sourceMeta.push({
      name: sr.source,
      count: sr.results.length,
      error: sr.error,
    });
    allResults.push(...sr.results);
  }

  // 去重 + 排序
  const deduped = deduplicateResults(allResults);
  const prioritized = prioritizeResults(deduped);

  return {
    results: prioritized.slice(0, maxResults),
    sources: sourceMeta,
  };
}
