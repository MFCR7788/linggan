// 媒体素材搜索 — 统一入口
// 并行搜索多个 provider，智能去重排序

import type {
  MediaSearchOptions,
  MediaSearchResponse,
  MediaSearchResult,
  SearchRequestOptions,
} from './types';
import { pexelsProvider } from './pexels';
import { pixabayProvider } from './pixabay';
import { unsplashProvider } from './unsplash';
import { extractSearchKeywords } from './keyword-translator';

// 搜索结果缓存 (简单 LRU)
interface CacheEntry {
  results: MediaSearchResult[];
  total: number;
  timestamp: number;
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_MAX = 100;
const CACHE_TTL = 15 * 60 * 1000; // 15 分钟

function cacheGet(key: string): CacheEntry | undefined {
  const entry = searchCache.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      searchCache.delete(key);
      return undefined;
    }
    searchCache.delete(key);
    searchCache.set(key, entry);
    return entry;
  }
  return undefined;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (searchCache.size >= CACHE_MAX) {
    const first = searchCache.keys().next().value;
    if (first) searchCache.delete(first);
  }
  searchCache.set(key, entry);
}

function buildCacheKey(query: string, type: string, page: number, perPage: number): string {
  return `${query}|${type}|${page}|${perPage}`;
}

/** 去重（按媒体 URL 去重，保留质量最高的） */
function deduplicateResults(results: MediaSearchResult[]): MediaSearchResult[] {
  const seen = new Map<string, MediaSearchResult>();
  for (const r of results) {
    const key = r.mediaUrl || r.id;
    const existing = seen.get(key);
    if (!existing || (r.width * r.height) > (existing.width * existing.height)) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

/** 按质量排序（分辨率高的优先） */
function sortByQuality(results: MediaSearchResult[]): MediaSearchResult[] {
  return results.sort((a, b) => {
    const resA = a.width * a.height;
    const resB = b.width * b.height;
    return resB - resA;
  });
}

/**
 * 搜索媒体素材 — 主入口
 *
 * @example
 * const result = await searchMedia({ query: 'sunset beach', type: 'image' });
 * const result = await searchMedia({ query: '城市夜景', type: 'video', provider: 'pexels' });
 */
export async function searchMedia(options: MediaSearchOptions): Promise<MediaSearchResponse> {
  const {
    query,
    type = 'image',
    provider = 'all',
    page = 1,
    perPage = 20,
    minWidth,
    minHeight,
    orientation,
    language = 'zh',
  } = options;

  // 中文 → 英文关键词翻译
  let searchQuery = query;
  let keywords: string[] = [query];
  if (language === 'zh') {
    keywords = await extractSearchKeywords(query);
    searchQuery = keywords[0] || query;
  }

  // 检查缓存（仅缓存第一页的通用搜索）
  if (page === 1 && provider === 'all') {
    const cacheKey = buildCacheKey(searchQuery, type, page, perPage);
    const cached = cacheGet(cacheKey);
    if (cached) {
      return {
        results: cached.results.slice(0, perPage),
        page,
        perPage,
        total: cached.total,
        hasMore: perPage < cached.total,
        searchQuery,
      };
    }
  }

  const requestOptions: SearchRequestOptions = {
    page,
    perPage,
    minWidth,
    minHeight,
    orientation,
  };

  // 并行搜索指定 provider(s)
  const providers = provider === 'all'
    ? [pexelsProvider, pixabayProvider, unsplashProvider]
    : provider === 'pexels' ? [pexelsProvider]
    : provider === 'pixabay' ? [pixabayProvider]
    : [unsplashProvider];

  // 用多个关键词并行搜索（每个 provider 用第一个关键词，如果 fail 再尝试其他）
  const allResults: MediaSearchResult[] = [];

  await Promise.all(
    providers.map(async (p) => {
      for (const kw of keywords) {
        try {
          const results =
            type === 'image'
              ? await p.searchImages(kw, requestOptions)
              : await p.searchVideos(kw, requestOptions);
          if (results.length > 0) {
            allResults.push(...results);
            break; // 找到结果就停止尝试其他关键词
          }
        } catch (e) {
          console.warn(`[media-search] ${p.id} 搜索 "${kw}" 失败:`, e);
        }
      }
    })
  );

  // 去重 + 排序
  const deduped = deduplicateResults(allResults);
  const sorted = sortByQuality(deduped);

  // 缓存（仅第一页）
  if (page === 1 && provider === 'all') {
    const cacheKey = buildCacheKey(searchQuery, type, 1, perPage);
    cacheSet(cacheKey, { results: sorted, total: sorted.length, timestamp: Date.now() });
  }

  return {
    results: sorted.slice(0, perPage),
    page,
    perPage,
    total: sorted.length,
    hasMore: sorted.length > page * perPage,
    searchQuery,
  };
}
