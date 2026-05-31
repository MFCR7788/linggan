import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { SearchResult } from './types';

const chinaAxios = axios.create({ timeout: 15000 });

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
