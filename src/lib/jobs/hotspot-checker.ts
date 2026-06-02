import { createAdminClient } from '../supabase-server';
import { searchBing, searchHackerNews } from '../search/global-search';
import {
  searchSogou, searchBilibili, searchWeibo, searchBaiduHot, searchDouyinHot, searchZhihuHot, searchToutiaoHot,
  fetchWeiboHotList, fetchZhihuHotList, fetchBaiduHotList, fetchDouyinHotList, fetchToutiaoHotList,
} from '../search/china-search';
import { expandKeyword, matchHotListAgainstKeywords, fetchPageContent, batchAnalyze } from '../analysis/hotspot-analyzer';
import { deduplicateResults, filterByFreshness, prioritizeResults, normalizeUrlForDedup } from '../search';
import { SearchResult, HotListItem } from '../search/types';

// 来源配额
const TWITTER_QUOTA = 0;   // 没有 Twitter API Key，设为 0
const OTHER_QUOTA = 15;

// 热榜缓存，一次检查周期只拉取一次
interface HotListCache {
  weibo: HotListItem[];
  zhihu: HotListItem[];
  baidu: HotListItem[];
  douyin: HotListItem[];
  toutiao: HotListItem[];
}

async function fetchAllHotLists(): Promise<HotListCache> {
  console.log('Fetching hot lists...');
  const [weibo, zhihu, baidu, douyin, toutiao] = await Promise.allSettled([
    fetchWeiboHotList(),
    fetchZhihuHotList(),
    fetchBaiduHotList(),
    fetchDouyinHotList(),
    fetchToutiaoHotList(),
  ]);
  const result = {
    weibo: weibo.status === 'fulfilled' ? weibo.value : [],
    zhihu: zhihu.status === 'fulfilled' ? zhihu.value : [],
    baidu: baidu.status === 'fulfilled' ? baidu.value : [],
    douyin: douyin.status === 'fulfilled' ? douyin.value : [],
    toutiao: toutiao.status === 'fulfilled' ? toutiao.value : [],
  };
  console.log(`Hot lists: Weibo=${result.weibo.length}, Zhihu=${result.zhihu.length}, Baidu=${result.baidu.length}, Douyin=${result.douyin.length}, Toutiao=${result.toutiao.length}`);
  return result;
}

/**
 * 聚合多来源搜索
 * 热榜平台（微博/知乎/百度）优先用热榜 API + 本地关键词匹配，失败时 fallback 到 HTML 抓取
 */
async function searchAllSources(
  keyword: string,
  expandedKeywords: string[],
  hotLists?: HotListCache
): Promise<SearchResult[]> {

  // 热榜优先平台：有热榜数据就用本地匹配，否则 fallback 到 HTML 抓取
  const hotListSources = [
    { name: 'Weibo', key: 'weibo' as const, searchFn: searchWeibo },
    { name: 'Zhihu', key: 'zhihu' as const, searchFn: searchZhihuHot },
    { name: 'Baidu', key: 'baidu' as const, searchFn: searchBaiduHot },
    { name: 'Douyin', key: 'douyin' as const, searchFn: searchDouyinHot },
    { name: 'Toutiao', key: 'toutiao' as const, searchFn: searchToutiaoHot },
  ];

  const hotPromises = hotListSources.map(async ({ name, key, searchFn }) => {
    try {
      if (hotLists && hotLists[key].length > 0) {
        const matched = matchHotListAgainstKeywords(hotLists[key], expandedKeywords, key);
        console.log(`  ${name} (hot list): ${matched.length} results`);
        return { name, results: matched };
      }
      // Fallback 到旧 HTML 抓取
      const results = await searchFn(keyword);
      console.log(`  ${name} (scrape): ${results.length} results`);
      return { name, results };
    } catch {
      console.log(`  ${name}: failed`);
      return { name, results: [] as SearchResult[] };
    }
  });

  // 直接搜索平台：保持原有逻辑
  const directSources = [
    { name: 'Bing', fn: searchBing },
    { name: 'HackerNews', fn: searchHackerNews },
    { name: 'Sogou', fn: searchSogou },
    { name: 'Bilibili', fn: searchBilibili },
  ];

  const directPromises = directSources.map(async ({ name, fn }) => {
    try {
      const results = await fn(keyword);
      console.log(`  ${name}: ${results.length} results`);
      return { name, results };
    } catch {
      console.log(`  ${name}: failed`);
      return { name, results: [] as SearchResult[] };
    }
  });

  const allResults = await Promise.all([...hotPromises, ...directPromises]);
  return allResults.flatMap(r => r.results);
}

/**
 * 检查指定用户是否已存在相同热点（基于 URL 或标题）
 * @param userId 可选，传入时只检查该用户的热点；不传时检查全局
 */
async function findExistingHotspot(item: SearchResult, userId?: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const normalizedUrl = normalizeUrlForDedup(item.url, item.source);

    // 先按 URL 查
    let urlQuery = supabase
      .from('hot_items')
      .select('id')
      .eq('original_url', normalizedUrl)
      .limit(1);
    if (userId) urlQuery = urlQuery.eq('user_id', userId);
    const { data: urlMatches } = await urlQuery;
    if (Array.isArray(urlMatches) && urlMatches.length > 0) return true;

    // 再按平台+标题查
    let titleQuery = supabase
      .from('hot_items')
      .select('id')
      .eq('platform', item.source)
      .eq('title', item.title)
      .limit(1);
    if (userId) titleQuery = titleQuery.eq('user_id', userId);
    const { data: titleMatches } = await titleQuery;
    return Array.isArray(titleMatches) && titleMatches.length > 0;
  } catch {
    return false;
  }
}

/**
 * 构建 hot_items 插入数据
 */
function buildHotItemPayload(item: SearchResult, analysis: any, userId: string, keywordId: string) {
  return {
    user_id: userId,
    monitor_keyword_id: keywordId,
    platform: item.source,
    original_url: item.url,
    title: item.title,
    original_content: (analysis.fullContent || item.content),
    author: item.author?.name || null,
    ai_summary: analysis.summary || null,
    relevance_reason: analysis.relevanceReason || null,
    key_points: [],
    creation_suggestions: [],
    view_count: item.viewCount || 0,
    like_count: item.likeCount || 0,
    comment_count: item.commentCount || 0,
    share_count: 0,
    relevance_score: analysis.relevance,
    importance_level: analysis.importance,
    credibility_level: analysis.isReal ? 'green' : 'yellow',
    credibility_score: analysis.isReal ? 80 : 50,
    status: 'new',
    is_read: false,
    published_at: item.publishedAt?.toISOString() || null,
    captured_at: new Date().toISOString(),
  };
}

/**
 * 运行热点检查
 *
 * 关键词去重：相同文本的关键词分组处理，只搜索/AI分析一次
 * 热点共享：同一关键词的多个用户都能获得热点条目
 */
export async function runHotspotCheck(): Promise<{ newCount: number; errors: string[] }> {
  console.log('Starting hotspot check...');
  const errors: string[] = [];
  let newCount = 0;

  try {
    const supabase = createAdminClient();

    // 获取所有激活的用户监控关键词
    const { data: activeKeywords, error: kwError } = await supabase
      .from('monitor_keywords')
      .select('*')
      .eq('is_active', true);

    if (kwError) {
      console.error('Failed to fetch keywords:', kwError);
      return { newCount: 0, errors: ['Database query failed'] };
    }

    if (!activeKeywords || activeKeywords.length === 0) {
      console.log('No active keywords to monitor');
      return { newCount: 0, errors: [] };
    }

    // ---- 按关键词文本分组去重（忽略大小写/首尾空格） ----
    const keywordMap = new Map<string, typeof activeKeywords>();
    for (const kw of activeKeywords) {
      const normalized = kw.keyword.trim().toLowerCase();
      if (!keywordMap.has(normalized)) keywordMap.set(normalized, []);
      keywordMap.get(normalized)!.push(kw);
    }
    console.log(`Total ${activeKeywords.length} active keywords → ${keywordMap.size} unique`);

    // 一次检查周期只拉取一次热榜
    const hotLists = await fetchAllHotLists();

    for (const [normalizedKey, keywordRows] of keywordMap) {
      const keyword = keywordRows[0].keyword; // 用原始大小写
      const userCount = keywordRows.length;
      console.log(`\nChecking keyword: "${keyword}"${userCount > 1 ? ` (${userCount} users)` : ''}`);

      try {
        // ---- 查询扩展（同关键词只做一次） ----
        const expandedKeywords = await expandKeyword(keyword);
        console.log(`  Expanded to ${expandedKeywords.length} variants`);

        // ---- 多来源搜索（同关键词只做一次） ----
        const allResults = await searchAllSources(keyword, expandedKeywords, hotLists);
        const uniqueResults = deduplicateResults(allResults);
        const freshResults = filterByFreshness(uniqueResults);
        const sortedResults = prioritizeResults(freshResults);
        console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh`);

        // ====== 四阶段流水线（节省 token：批量 fetch + 一次 AI 出全部字段） ======
        type Candidate = { item: any; existsGlobally: boolean };

        // 阶段 1：扫描 + 全局去重（已有项目不计 OTHER_QUOTA）
        const candidates: Candidate[] = [];
        let processedCount = 0;
        for (const item of sortedResults) {
          if (processedCount >= OTHER_QUOTA) break;
          try {
            const existsGlobally = await findExistingHotspot(item);
            candidates.push({ item, existsGlobally });
            if (!existsGlobally) processedCount++;
          } catch (e) {
            console.error('  Pre-check error:', e);
          }
        }

        // 阶段 2：批量抓取全文（已存在的跳过抓取）
        const fullContents = await Promise.allSettled(
          candidates.map((c) =>
            c.existsGlobally ? Promise.resolve('') : fetchPageContent(c.item.url, c.item.source)
          )
        );

        // 阶段 3：批量 AI 分析（一次输出 6 字段 + 100 字 summary）
        const aiInputs = candidates.map((c, i) => ({
          shortText: c.item.title + '\n' + c.item.content,
          fullContent: c.existsGlobally
            ? null
            : fullContents[i].status === 'fulfilled'
              ? fullContents[i].value
              : '',
        }));
        const aiResults = await batchAnalyze(aiInputs, keyword, expandedKeywords);

        // 阶段 4：过滤 + 分发插入
        for (let i = 0; i < candidates.length; i++) {
          const { item, existsGlobally } = candidates[i];
          let analysis: any;
          if (existsGlobally) {
            analysis = {
              isReal: true,
              relevance: 75,
              relevanceReason: '已收录热点',
              importance: 'medium',
              summary: item.content.slice(0, 100),
              fullContent: item.content,
            };
            console.log(`  Reusing existing: ${item.title.slice(0, 30)}...`);
          } else {
            const aiResult = aiResults[i];
            if (!aiResult.isReal) {
              console.log(`  Filtered fake/spam: ${item.title.slice(0, 30)}...`);
              continue;
            }
            if (aiResult.relevance < 50) {
              console.log(`  Low relevance (${aiResult.relevance}): ${item.title.slice(0, 30)}...`);
              continue;
            }
            const fullContent =
              (fullContents[i].status === 'fulfilled' ? fullContents[i].value : '') || item.content;
            analysis = { ...aiResult, fullContent };
            console.log(`  New hotspot [${item.source}]: ${item.title.slice(0, 40)}... (${aiResult.importance}) → shared to ${userCount} user(s)`);
          }

          // 按用户分发：每个监控此关键词的用户都获得一份热点
          for (const kwRow of keywordRows) {
            const userHasIt = await findExistingHotspot(item, kwRow.user_id);
            if (userHasIt) {
              console.log(`  Already owned by user ${kwRow.user_id.slice(0, 8)}...`);
              continue;
            }

            const { error: insertError } = await supabase
              .from('hot_items')
              .insert(buildHotItemPayload(item, analysis, kwRow.user_id, kwRow.id));

            if (insertError) {
              console.error(`  Insert error for user ${kwRow.user_id.slice(0, 8)}:`, insertError);
              continue;
            }

            const { error: notifError } = await supabase
              .from('notifications')
              .insert({
                user_id: kwRow.user_id,
                type: 'hotspot',
                title: `发现新热点: ${item.title.slice(0, 50)}`,
                content: analysis.summary || item.content.slice(0, 100),
              });

            if (notifError) {
              console.error('  Notification insert error:', notifError);
            }

            newCount++;
          }
        }

        // ---- 更新该关键词所有行的 last_check_at ----
        const now = new Date().toISOString();
        for (const kwRow of keywordRows) {
          await supabase
            .from('monitor_keywords')
            .update({ last_check_at: now, updated_at: now })
            .eq('id', kwRow.id);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (kwError) {
        console.error(`Error checking keyword "${keyword}":`, kwError);
        errors.push(`Error checking "${keyword}": ${kwError instanceof Error ? kwError.message : String(kwError)}`);
      }
    }

  } catch (error) {
    console.error('Hotspot check error:', error);
    errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`\nHotspot check completed. Found ${newCount} new hotspots.`);
  return { newCount, errors };
}
