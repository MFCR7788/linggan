import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { aggregateSearch, type SearchSource } from '@/lib/search';

export const dynamic = 'force-dynamic';

interface SearchRequest {
  query: string;
  /** 指定搜索源，不传则用全部 */
  sources?: SearchSource[];
  /** 是否包含本地商户搜索（大众点评），默认 true */
  localBusiness?: boolean;
}

export const POST = withAuth(async ({ request }) => {
  try {
    const body: SearchRequest = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return createApiError('请输入搜索关键词', 400);
    }

    // 默认源：中文综合搜索
    const defaultSources: SearchSource[] = body.localBusiness !== false
      ? ['baidu', 'sogou', 'bing', 'weibo', 'zhihu', 'dianping']
      : ['baidu', 'sogou', 'bing', 'weibo', 'zhihu'];

    const sources = body.sources || defaultSources;

    const { results, sources: sourceMeta } = await aggregateSearch(query.trim(), {
      sources,
      maxResults: 20,
      sourceTimeout: 8000,
    });

    // 按来源分组，方便前端展示
    const grouped: Record<string, typeof results> = {};
    for (const r of results) {
      if (!grouped[r.source]) grouped[r.source] = [];
      grouped[r.source].push(r);
    }

    return createApiResponse({
      query,
      total: results.length,
      sources: sourceMeta,
      grouped,
      results,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return createApiError('搜索失败', 500);
  }
});
