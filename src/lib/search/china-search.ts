import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SearchResult, HotListItem } from './types';

const chinaProxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
  || process.env.http_proxy || process.env.https_proxy;
const chinaAxios = axios.create(
  chinaProxyUrl
    ? { timeout: 15000, httpsAgent: new HttpsProxyAgent(chinaProxyUrl), proxy: false }
    : { timeout: 15000 }
);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

function getUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

class RateLimiter {
  private last = 0;
  constructor(private ms: number = 5000) {}
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.last;
    if (elapsed < this.ms) await new Promise(r => setTimeout(r, this.ms - elapsed));
    this.last = Date.now();
  }
}

const sogouLimiter = new RateLimiter(3000);
const bilibiliLimiter = new RateLimiter(2000);
const weiboLimiter = new RateLimiter(5000);
const baiduLimiter = new RateLimiter(5000);
const douyinLimiter = new RateLimiter(5000);
const zhihuLimiter = new RateLimiter(5000);
const toutiaoLimiter = new RateLimiter(5000);
const weiboHotLimiter = new RateLimiter(10000);
const zhihuHotLimiter = new RateLimiter(10000);
const baiduHotLimiter = new RateLimiter(10000);
const douyinHotLimiter = new RateLimiter(5000);
const toutiaoHotLimiter = new RateLimiter(5000);

// ====== 热榜拉取（公开 API，无需登录，一次调用获取整个热榜） ======

// 微博热搜 API 响应
interface WeiboHotResponse {
  data?: {
    realtime?: Array<{
      word: string;
      word_scheme?: string;
      raw_hot: number;
      num: number;
    }>;
  };
}

export async function fetchWeiboHotList(): Promise<HotListItem[]> {
  await weiboHotLimiter.wait();
  try {
    const res = await chinaAxios.get<WeiboHotResponse>(
      'https://weibo.com/ajax/side/hotSearch',
      {
        headers: {
          'User-Agent': getUA(),
          'Accept': 'application/json',
          'Referer': 'https://weibo.com/',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 15000,
      }
    );
    const realtime = res.data?.data?.realtime;
    if (!Array.isArray(realtime)) return [];
    return realtime.map((item) => ({
      title: item.word || '',
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || '')}`,
      content: `热搜第${item.num || 0}位，热度${item.raw_hot || 0}`,
      rank: item.num || 0,
      hotScore: item.raw_hot || 0,
      topicId: item.word || '',
    }));
  } catch (error) {
    console.error('fetchWeiboHotList error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// 知乎热榜 API 响应
interface ZhihuHotResponse {
  top_search?: {
    words?: Array<{
      query: string;
      display_query?: string;
      uuid?: string;
    }>;
  };
}

export async function fetchZhihuHotList(): Promise<HotListItem[]> {
  await zhihuHotLimiter.wait();
  try {
    const res = await chinaAxios.get<ZhihuHotResponse>(
      'https://www.zhihu.com/api/v4/search/top_search',
      {
        headers: {
          'User-Agent': getUA(),
          'Accept': 'application/json',
          'Referer': 'https://www.zhihu.com/hot',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 15000,
      }
    );
    const words = res.data?.top_search?.words;
    if (!Array.isArray(words)) return [];
    return words
      .filter((w) => w.query)
      .map((item, index) => {
        const title = item.display_query || item.query;
        return {
          title,
          url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(item.query)}`,
          content: '',
          rank: index + 1,
          hotScore: words.length - index,
          topicId: item.uuid,
        };
      });
  } catch (error) {
    console.error('fetchZhihuHotList error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/** 解析热度文本 "1000 万热度" -> 10000000 */
function parseHotText(text?: string): number {
  if (!text) return 0;
  const numMatch = text.match(/([\d.]+)\s*万?/);
  if (!numMatch) return 0;
  const num = parseFloat(numMatch[1]);
  return text.includes('万') ? Math.round(num * 10000) : Math.round(num);
}

// 百度热搜 API/SSR 响应
interface BaiduBoardItem {
  word: string;
  desc?: string;
  url?: string;
  hotScore?: string;
}

export async function fetchBaiduHotList(): Promise<HotListItem[]> {
  await baiduHotLimiter.wait();
  try {
    // 优先尝试 API 接口
    let items: BaiduBoardItem[] = [];
    const headers = {
      'User-Agent': getUA(),
      'Accept-Language': 'zh-CN,zh;q=0.9',
    };

    try {
      const apiRes = await chinaAxios.get(
        'https://top.baidu.com/api/board',
        { params: { tab: 'realtime' }, headers: { ...headers, 'Accept': 'application/json' }, timeout: 15000 }
      );
      const cards = apiRes.data?.data?.cards ?? apiRes.data?.cards ?? [];
      for (const card of cards) {
        if (Array.isArray(card.content)) {
          items.push(...card.content.map((c: any) => ({
            word: c.word || c.query || '',
            desc: c.desc || c.descSummary || '',
            url: c.url || c.appUrl || '',
            hotScore: String(c.hotScore || c.heatScore || '0'),
          })));
        }
      }
    } catch {
      // API 失败，尝试从 HTML 提取 __NEXT_DATA__
    }

    if (items.length === 0) {
      const htmlRes = await chinaAxios.get(
        'https://top.baidu.com/board?tab=realtime',
        { headers: { ...headers, 'Accept': 'text/html' }, timeout: 15000 }
      );
      const html = htmlRes.data;
      // 尝试 __NEXT_DATA__ JSON
      const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/);
      if (nextDataMatch) {
        try {
          const parsed = JSON.parse(nextDataMatch[1]);
          const cards = parsed?.props?.pageProps?.cards ?? parsed?.props?.cards ?? [];
          for (const card of cards) {
            if (Array.isArray(card.content)) {
              items.push(...card.content.map((c: any) => ({
                word: c.word || c.query || '',
                desc: c.desc || c.descSummary || '',
                url: c.url || c.appUrl || '',
                hotScore: String(c.hotScore || c.heatScore || '0'),
              })));
            }
          }
        } catch { /* ignore parse errors */ }
      }
      // 尝试 window.__INITIAL_STATE__
      if (items.length === 0) {
        const initStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
        if (initStateMatch) {
          try {
            const parsed = JSON.parse(initStateMatch[1]);
            const cards = parsed?.cards ?? parsed?.data?.cards ?? [];
            for (const card of cards) {
              if (Array.isArray(card.content)) {
                items.push(...card.content.map((c: any) => ({
                  word: c.word || c.query || '',
                  desc: c.desc || '',
                  url: c.url || '',
                  hotScore: String(c.hotScore || c.heatScore || '0'),
                })));
              }
            }
          } catch { /* ignore */ }
        }
      }
    }

    return items
      .filter((item) => item.word)
      .map((item, index) => ({
        title: item.word,
        url: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word)}`,
        content: item.desc || '',
        rank: index + 1,
        hotScore: parseInt(item.hotScore || '0', 10) || 0,
        topicId: item.word,
      }));
  } catch (error) {
    console.error('fetchBaiduHotList error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 抖音热榜 ======

// 抖音热搜 API 响应
interface DouyinHotResponse {
  data?: {
    word_list?: Array<{
      word: string;
      hot_value: number;
      sentence_id?: string;
      event_time?: number;
      label?: string;
      video_count?: number;
    }>;
    trending_list?: Array<{
      word: string;
      hot_value: number;
      sentence_id?: string;
      discuss_video_count?: number;
    }>;
  };
}

export async function fetchDouyinHotList(): Promise<HotListItem[]> {
  await douyinHotLimiter.wait();
  try {
    const res = await chinaAxios.get<DouyinHotResponse>(
      'https://www.douyin.com/aweme/v1/web/hot/search/list/',
      {
        headers: {
          'User-Agent': getUA(),
          'Accept': 'application/json',
          'Referer': 'https://www.douyin.com/hot',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 15000,
      }
    );
    const wordList = res.data?.data?.word_list;
    const trendingList = res.data?.data?.trending_list;
    if (!Array.isArray(wordList)) return [];
    // 合并 word_list 和 trending_list，去重
    const seen = new Set<string>();
    const items: HotListItem[] = [];
    const push = (item: { word: string; hot_value: number; sentence_id?: string; label?: string; video_count?: number }, rank: number) => {
      const word = item.word?.trim();
      if (!word || seen.has(word)) return;
      seen.add(word);
      items.push({
        title: word,
        url: `https://www.douyin.com/search/${encodeURIComponent(word)}`,
        content: [item.label, item.video_count ? `${item.video_count}个视频` : ''].filter(Boolean).join(' '),
        rank,
        hotScore: item.hot_value || 0,
        topicId: item.sentence_id ? String(item.sentence_id) : undefined,
      });
    };
    wordList.forEach((w, i) => push(w, i + 1));
    if (Array.isArray(trendingList)) {
      trendingList.forEach((t, i) => push(t, wordList.length + i + 1));
    }
    return items;
  } catch (error) {
    console.error('fetchDouyinHotList error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 今日头条热榜 ======

interface ToutiaoHotItem {
  ClusterId?: number;
  Title: string;
  Label?: string;
  LabelUrl?: string;
  HotValue?: number;
  Url?: string;
}

export async function fetchToutiaoHotList(): Promise<HotListItem[]> {
  await toutiaoHotLimiter.wait();
  try {
    const htmlRes = await chinaAxios.get(
      'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      {
        headers: {
          'User-Agent': getUA(),
          'Accept': 'text/html,application/json',
          'Referer': 'https://www.toutiao.com/',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: 15000,
      }
    );
    // 响应格式是 JSON 开头后接 HTML，需要提取 JSON 部分
    const raw = typeof htmlRes.data === 'string' ? htmlRes.data : JSON.stringify(htmlRes.data);
    // 通过括号匹配找到 JSON 尾部
    let depth = 0;
    let jsonEnd = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }
    const jsonStr = jsonEnd > 0 ? raw.slice(0, jsonEnd) : raw;
    const parsed = JSON.parse(jsonStr);
    const data: ToutiaoHotItem[] = parsed?.data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item.Title)
      .map((item, index) => ({
        title: item.Title,
        url: item.Url || `https://www.toutiao.com/trending/${item.ClusterId || ''}`,
        content: item.Label || '',
        rank: index + 1,
        hotScore: item.HotValue || 0,
        topicId: item.ClusterId ? String(item.ClusterId) : undefined,
      }));
  } catch (error) {
    console.error('fetchToutiaoHotList error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 搜狗搜索 ======
export async function searchSogou(query: string): Promise<SearchResult[]> {
  await sogouLimiter.wait();
  try {
    const res = await chinaAxios.get('https://www.sogou.com/web', {
      params: { query, ie: 'utf-8' },
      headers: { 'User-Agent': getUA(), 'Accept-Language': 'zh-CN,zh;q=0.9' },
      timeout: 15000, maxRedirects: 5
    });
    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];
    $('.vrwrap, .rb').each((_, el) => {
      const titleEl = $(el).find('h3 a, .vr-title a, .vrTitle a').first();
      const title = titleEl.text().trim();
      let url = titleEl.attr('href') || '';
      if (url.startsWith('/link?url=')) url = `https://www.sogou.com${url}`;
      const snippet = $(el).find('.space-txt, .str-text-info, .str_info, .text-layout').text().trim() || $(el).find('p').first().text().trim();
      if (title && url && !title.includes('大家还在搜')) {
        results.push({ title, content: snippet || title, url, source: 'sogou' });
      }
    });
    return results;
  } catch (error) {
    console.error('Sogou search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== Bilibili 搜索 ======
interface BiliVideo { aid: number; bvid: string; title: string; description: string; author: string; mid: number; pic: string; play: number; favorites: number; review: number; danmaku: number; like: number; pubdate: number; }
interface BiliSearchRes { code: number; data?: { result?: BiliVideo[] } }

export async function searchBilibili(query: string): Promise<SearchResult[]> {
  await bilibiliLimiter.wait();
  try {
    const buvid3 = `${crypto.randomUUID()}infoc`;
    const threeDaysAgo = Math.floor((Date.now() - 3 * 24 * 3600 * 1000) / 1000);
    const res = await chinaAxios.get<BiliSearchRes>('https://api.bilibili.com/x/web-interface/search/type', {
      params: { keyword: query, search_type: 'video', order: 'pubdate', page: 1, pagesize: 20 },
      headers: { 'User-Agent': getUA(), 'Referer': 'https://search.bilibili.com/', 'Cookie': `buvid3=${buvid3}` },
      timeout: 15000
    });
    if (res.data.code !== 0 || !res.data.data?.result) return [];
    return res.data.data.result
      .filter(v => v.pubdate >= threeDaysAgo)
      .map(v => ({
        title: v.title.replace(/<\/?em[^>]*>/g, ''),
        content: v.description || v.title.replace(/<\/?em[^>]*>/g, ''),
        url: `https://www.bilibili.com/video/${v.bvid}`,
        source: 'bilibili' as const,
        sourceId: v.bvid,
        publishedAt: new Date(v.pubdate * 1000),
        viewCount: v.play,
        likeCount: v.like,
        commentCount: v.review,
        danmakuCount: v.danmaku,
        author: { name: v.author, username: String(v.mid) }
      }));
  } catch (error) {
    console.error('Bilibili search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 微博搜索 ======
export async function searchWeibo(query: string): Promise<SearchResult[]> {
  await weiboLimiter.wait();
  try {
    const res = await chinaAxios.get('https://s.weibo.com/weibo', {
      params: { q: query, typeall: 1, suball: 1, timescope: 'custom:2026-01-01:2026-12-31', page: 1 },
      headers: { 'User-Agent': getUA(), 'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];
    $('.card-wrap').each((_, el) => {
      const titleEl = $(el).find('.txt, .card-txt, .weibo-txt');
      const title = titleEl.text().trim().slice(0, 200);
      const urlEl = $(el).find('a[href*="weibo.com"]').first();
      const url = urlEl.attr('href');
      if (title && title.length > 5 && url) {
        const finalUrl = url.startsWith('//') ? `https:${url}` : url.startsWith('/') ? `https://weibo.com${url}` : url;
        results.push({ title: title.replace(/\s+/g, ' ').slice(0, 150), content: title, url: finalUrl, source: 'weibo' });
      }
    });
    return results;
  } catch (error) {
    console.error('Weibo search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 百度热搜 ======
export async function searchBaiduHot(query: string): Promise<SearchResult[]> {
  await baiduLimiter.wait();
  try {
    const res = await chinaAxios.get('https://www.baidu.com/s', {
      params: { wd: query, ie: 'utf-8' },
      headers: { 'User-Agent': getUA(), 'Accept-Language': 'zh-CN,zh;q=0.9' },
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];
    $('.result, .c-container').each((_, el) => {
      const titleEl = $(el).find('h3 a');
      const title = titleEl.text().trim();
      const url = titleEl.attr('href');
      const snippet = $(el).find('.c-abstract, .content-right_8Zs40').text().trim();
      if (title && url) {
        results.push({ title, content: snippet || title, url, source: 'baidu' });
      }
    });
    return results;
  } catch (error) {
    console.error('Baidu search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 抖音热搜 ======
export async function searchDouyinHot(query: string): Promise<SearchResult[]> {
  await douyinLimiter.wait();
  try {
    const res = await chinaAxios.get('https://www.douyin.com/search/' + encodeURIComponent(query), {
      headers: { 'User-Agent': getUA(), 'Cookie': '', 'Accept': 'application/json' },
      timeout: 15000
    });
    const html = res.data;
    const results: SearchResult[] = [];
    // 尝试从 HTML 中提取搜索数据
    const itemMatch = html.match(/<script[^>]*>window\._\_INITIAL_STATE__\s*=\s*({.*?});<\/script>/);
    if (itemMatch) {
      try {
        const data = JSON.parse(itemMatch[1]);
        const items = data?.wordList || data?.hotWords || [];
        if (Array.isArray(items)) {
          items.slice(0, 20).forEach((item: any) => {
            const title = item.word || item.hot_word || '';
            if (title) {
              results.push({
                title,
                content: `${item.hot_value || ''} ${item.label || ''}`.trim() || title,
                url: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
                source: 'douyin',
                viewCount: item.hot_value || 0,
              });
            }
          });
        }
      } catch {}
    }
    // 如果上面没提取到，尝试提取页面上的热搜词
    if (results.length === 0) {
      const $ = cheerio.load(html);
      $('.hot-title, .search-hot-item, .search-item-label').each((_, el) => {
        const title = $(el).text().trim();
        if (title && title.length > 2) {
          results.push({ title, content: title, url: `https://www.douyin.com/search/${encodeURIComponent(title)}`, source: 'douyin' });
        }
      });
    }
    return results;
  } catch (error) {
    console.error('Douyin search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 知乎热榜 ======
export async function searchZhihuHot(query: string): Promise<SearchResult[]> {
  await zhihuLimiter.wait();
  try {
    const res = await chinaAxios.get('https://www.zhihu.com/search', {
      params: { q: query, type: 'content' },
      headers: {
        'User-Agent': getUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': ''
      },
      timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];
    $('.SearchResult-card, .ContentItem, .Card').each((_, el) => {
      const titleEl = $(el).find('.ContentItem-title a, h2 a');
      const title = titleEl.text().trim();
      const url = titleEl.attr('href');
      const snippet = $(el).find('.RichText').text().trim().slice(0, 200);
      if (title && url) {
        const finalUrl = url.startsWith('/') ? `https://www.zhihu.com${url}` : url;
        results.push({ title, content: snippet || title, url: finalUrl, source: 'zhihu' });
      }
    });
    return results;
  } catch (error) {
    console.error('Zhihu search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

// ====== 头条热搜 ======
export async function searchToutiaoHot(query: string): Promise<SearchResult[]> {
  await toutiaoLimiter.wait();
  try {
    const res = await chinaAxios.get('https://www.toutiao.com/search/', {
      params: { keyword: query, pd: 'information' },
      headers: { 'User-Agent': getUA(), 'Accept-Language': 'zh-CN,zh;q=0.9' },
      timeout: 15000
    });
    const html = res.data;
    const results: SearchResult[] = [];
    const $ = cheerio.load(html);
    $('.title, .article-title a, .item-title').each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr('href');
      if (title && title.length > 5) {
        const url = href ? (href.startsWith('http') ? href : `https://www.toutiao.com${href}`) : `https://www.toutiao.com/search/${encodeURIComponent(query)}`;
        results.push({ title: title.replace(/\s+/g, ' ').slice(0, 150), content: title, url, source: 'toutiao' });
      }
    });
    return results;
  } catch (error) {
    console.error('Toutiao search error:', error instanceof Error ? error.message : error);
    return [];
  }
}
