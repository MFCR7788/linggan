import { SearchResult } from './types';

// 标准化 URL 用于去重
function normalizeUrlForDedup(url: string, source: string): string {
  // 搜狗跳转链接
  if (source === 'sogou' && url.includes('sogou.com/link')) {
    try {
      const urlObj = new URL(url);
      const target = urlObj.searchParams.get('url');
      if (target) return normalizeUrlForDedup(target, source);
    } catch {}
  }

  // 微信文章
  if (source === 'wechat' || source === 'sogou' || url.includes('mp.weixin.qq.com')) {
    try {
      const urlObj = new URL(url);
      const base = urlObj.origin + urlObj.pathname;
      const biz = urlObj.searchParams.get('__biz') || urlObj.searchParams.get('biz');
      const mid = urlObj.searchParams.get('mid');
      const idx = urlObj.searchParams.get('idx');
      const sn = urlObj.searchParams.get('sn');
      if (biz && mid && idx && sn) {
        return `${base}?__biz=${biz}&mid=${mid}&idx=${idx}&sn=${sn}`;
      }
      const signature = urlObj.searchParams.get('signature');
      if (signature) {
        const ver = urlObj.searchParams.get('ver');
        return `${base}?signature=${signature}&ver=${ver || ''}`;
      }
      return base;
    } catch { return url; }
  }

  // Bilibili
  if (url.includes('bilibili.com/video/')) {
    const match = url.match(/bilibili\.com\/video\/(BV[\w]+)/);
    if (match) return `https://www.bilibili.com/video/${match[1]}`;
  }

  // 标准处理
  try {
    const urlObj = new URL(url);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'from', 'isFromMainSearch', 'new'];
    trackingParams.forEach(p => urlObj.searchParams.delete(p));
    const cleaned = urlObj.origin + urlObj.pathname + urlObj.search;
    return cleaned.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
  } catch {
    return url.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
  }
}

// 标准化标题用于去重
function normalizeTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、；：""''【】《》（）—…·\-.!,?;:'"()\[\]{}<>\/\\@#$%^&*+=|~`]/g, '')
    .slice(0, 50);
}

// 去重
export function deduplicateResults(allResults: SearchResult[]): SearchResult[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  return allResults.filter(item => {
    const urlKey = normalizeUrlForDedup(item.url, item.source);
    if (seenUrls.has(urlKey)) return false;
    seenUrls.add(urlKey);

    const titleKey = normalizeTitleForDedup(item.title);
    if (titleKey.length >= 4 && seenTitles.has(titleKey)) return false;
    if (titleKey.length >= 4) seenTitles.add(titleKey);

    return true;
  });
}

// 新鲜度过滤
const MAX_AGE_HOURS = 3 * 24;
export function filterByFreshness(results: SearchResult[]): SearchResult[] {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000);
  return results.filter(item => {
    if (!item.publishedAt) return true;
    return item.publishedAt >= cutoff;
  });
}

// 按来源优先级排序
export function prioritizeResults(results: SearchResult[]): SearchResult[] {
  const priorityMap: Record<string, number> = {
    weibo: 1, zhihu: 2, toutiao: 3, baidu: 3, douyin: 3,
    bilibili: 4, hackernews: 5, sogou: 6, bing: 7,
    google: 8, duckduckgo: 9, twitter: 1,
  };
  return [...results].sort((a, b) => {
    return (priorityMap[a.source] || 99) - (priorityMap[b.source] || 99);
  });
}

export { normalizeUrlForDedup, normalizeTitleForDedup };
