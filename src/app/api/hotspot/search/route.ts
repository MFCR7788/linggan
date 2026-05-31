import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { searchBing, searchHackerNews } from '@/lib/search/global-search';
import { searchSogou, searchBilibili, searchWeibo, searchBaiduHot, searchZhihuHot, searchToutiaoHot } from '@/lib/search/china-search';
import { deduplicateResults } from '@/lib/search';
import { expandKeyword, analyzeContent, preMatchKeyword } from '@/lib/analysis/hotspot-analyzer';

export const dynamic = 'force-dynamic';

// 手动全网搜索
export const POST = withAuth(async ({ request }) => {
  const body = await request.json();
  const { query, region = 'both', resultsPerSource = 5 } = body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return createApiError('搜索关键词不能为空', 400);
  }

  // 查询扩展
  const expandedKeywords = await expandKeyword(query.trim());

  // 搜索
  const allResults: any[] = [];

  if (region === 'global' || region === 'both') {
    const [bingRes, hnRes] = await Promise.allSettled([
      searchBing(query.trim()),
      searchHackerNews(query.trim()),
    ]);
    if (bingRes.status === 'fulfilled') allResults.push(...bingRes.value.slice(0, resultsPerSource));
    if (hnRes.status === 'fulfilled') allResults.push(...hnRes.value.slice(0, resultsPerSource));
  }

  if (region === 'china' || region === 'both') {
    const [sogouRes, biliRes, weiboRes, baiduRes, zhihuRes, toutiaoRes] = await Promise.allSettled([
      searchSogou(query.trim()),
      searchBilibili(query.trim()),
      searchWeibo(query.trim()),
      searchBaiduHot(query.trim()),
      searchZhihuHot(query.trim()),
      searchToutiaoHot(query.trim()),
    ]);
    if (sogouRes.status === 'fulfilled') allResults.push(...sogouRes.value.slice(0, resultsPerSource));
    if (biliRes.status === 'fulfilled') allResults.push(...biliRes.value.slice(0, resultsPerSource));
    if (weiboRes.status === 'fulfilled') allResults.push(...weiboRes.value.slice(0, resultsPerSource));
    if (baiduRes.status === 'fulfilled') allResults.push(...baiduRes.value.slice(0, resultsPerSource));
    if (zhihuRes.status === 'fulfilled') allResults.push(...zhihuRes.value.slice(0, resultsPerSource));
    if (toutiaoRes.status === 'fulfilled') allResults.push(...toutiaoRes.value.slice(0, resultsPerSource));
  }

  // 去重
  const uniqueResults = deduplicateResults(allResults);
  console.log(`Search "${query}": ${allResults.length} results, ${uniqueResults.length} unique`);

  // AI 分析
  const analyzedResults = await Promise.all(
    uniqueResults.slice(0, 15).map(async (item) => {
      try {
        const fullText = item.title + '\n' + item.content;
        const preMatch = preMatchKeyword(fullText, expandedKeywords);
        const analysis = await analyzeContent(fullText, query.trim(), preMatch);
        return { ...item, analysis };
      } catch {
        return { ...item, analysis: null };
      }
    })
  );

  return createApiResponse({
    query,
    region,
    totalResults: uniqueResults.length,
    results: analyzedResults,
  });
});
