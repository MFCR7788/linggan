import { createAdminClient } from '../supabase-server';
import { searchBing, searchHackerNews } from '../search/global-search';
import { searchSogou, searchBilibili, searchWeibo, searchBaiduHot, searchDouyinHot, searchZhihuHot, searchToutiaoHot } from '../search/china-search';
import { expandKeyword, analyzeContent, preMatchKeyword } from '../analysis/hotspot-analyzer';
import { deduplicateResults, filterByFreshness, prioritizeResults, normalizeUrlForDedup } from '../search';
import { SearchResult } from '../search/types';

// 来源配额
const TWITTER_QUOTA = 0;   // 没有 Twitter API Key，设为 0
const OTHER_QUOTA = 15;

/**
 * 聚合多来源搜索
 */
async function searchAllSources(keyword: string): Promise<SearchResult[]> {
  const allPromises = [
    searchBing(keyword),
    searchHackerNews(keyword),
    searchSogou(keyword),
    searchWeibo(keyword),
    searchBilibili(keyword),
    searchBaiduHot(keyword),
    searchDouyinHot(keyword),
    searchZhihuHot(keyword),
    searchToutiaoHot(keyword),
  ] as const;

  const results = await Promise.allSettled(allPromises);
  const allResults: SearchResult[] = [];
  const sourceNames = ['Bing', 'HackerNews', 'Sogou', 'Weibo', 'Bilibili', 'Baidu', 'Douyin', 'Zhihu', 'Toutiao'];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      allResults.push(...r.value);
      console.log(`  ${sourceNames[i]}: ${r.value.length} results`);
    } else {
      console.log(`  ${sourceNames[i]}: failed`);
    }
  }

  return allResults;
}

/**
 * 检查是否已存在相同热点（基于 URL 或标题）
 */
async function findExistingHotspot(item: SearchResult): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const normalizedUrl = normalizeUrlForDedup(item.url, item.source);

    // 先按 URL 查
    const { data: urlMatches } = await supabase
      .from('hot_items')
      .select('id')
      .eq('original_url', normalizedUrl)
      .limit(1);

    if (Array.isArray(urlMatches) && urlMatches.length > 0) return true;

    // 再按平台+标题查
    const { data: titleMatches } = await supabase
      .from('hot_items')
      .select('id')
      .eq('platform', item.source)
      .eq('title', item.title)
      .limit(1);

    return Array.isArray(titleMatches) && titleMatches.length > 0;
  } catch {
    return false;
  }
}

/**
 * 运行热点检查
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

    console.log(`Checking ${activeKeywords.length} keywords...`);

    for (const keywordRow of activeKeywords) {
      const keyword = keywordRow.keyword;
      console.log(`\nChecking keyword: "${keyword}"`);

      try {
        // 查询扩展
        const expandedKeywords = await expandKeyword(keyword);
        console.log(`  Expanded to ${expandedKeywords.length} variants`);

        // 多来源并行搜索
        const allResults = await searchAllSources(keyword);

        // 去重、新鲜度过滤、优先级排序
        const uniqueResults = deduplicateResults(allResults);
        const freshResults = filterByFreshness(uniqueResults);
        const sortedResults = prioritizeResults(freshResults);
        console.log(`  Total: ${allResults.length} raw → ${uniqueResults.length} unique → ${freshResults.length} fresh`);

        // 处理结果
        let processedCount = 0;

        for (const item of sortedResults) {
          if (processedCount >= OTHER_QUOTA) break;

          try {
            // 检查是否已存在
            const exists = await findExistingHotspot(item);
            if (exists) {
              console.log(`  Duplicate skipped: ${item.title.slice(0, 30)}...`);
              continue;
            }

            // AI 分析
            const fullText = item.title + '\n' + item.content;
            const preMatch = preMatchKeyword(fullText, expandedKeywords);
            const analysis = await analyzeContent(fullText, keyword, preMatch);

            // 过滤假内容
            if (!analysis.isReal) {
              console.log(`  Filtered fake/spam: ${item.title.slice(0, 30)}...`);
              continue;
            }

            // 相关性阈值
            if (analysis.relevance < 50) {
              console.log(`  Low relevance (${analysis.relevance}): ${item.title.slice(0, 30)}...`);
              continue;
            }

            // 保存到热点库
            const { error: insertError } = await supabase
              .from('hot_items')
              .insert({
                user_id: keywordRow.user_id,
                monitor_keyword_id: keywordRow.id,
                platform: item.source,
                original_url: item.url,
                title: item.title,
                original_content: item.content,
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
              });

            if (insertError) {
              console.error(`  Insert error:`, insertError);
              continue;
            }

            // 为每个订阅了此关键词的用户创建通知
            // 因为 Linggan 的 monitor_keywords 是按用户隔离的，所以 keywordRow 属于特定用户
            const { error: notifError } = await supabase
              .from('notifications')
              .insert({
                user_id: keywordRow.user_id,
                type: 'hotspot',
                title: `发现新热点: ${item.title.slice(0, 50)}`,
                content: analysis.summary || item.content.slice(0, 100),
              });

            if (notifError) {
              console.error('  Notification insert error:', notifError);
            }

            newCount++;
            processedCount++;
            console.log(`  New hotspot [${item.source}]: ${item.title.slice(0, 40)}... (${analysis.importance})`);

          } catch (itemError) {
            console.error(`  Error processing item:`, itemError);
            errors.push(`Error processing item "${item.title.slice(0, 30)}": ${itemError instanceof Error ? itemError.message : String(itemError)}`);
          }
        }

        // 更新关键词的 last_check_at
        await supabase
          .from('monitor_keywords')
          .update({ last_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', keywordRow.id);

        // 避免过快请求
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
