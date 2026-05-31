import axios from 'axios';
import * as cheerio from 'cheerio';
import { SearchResult } from './types';

const searchAxios = axios.create({ timeout: 15000 });

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 频率限制器
class RateLimiter {
  private lastRequestTime = 0;
  constructor(private minIntervalMs: number = 5000) {}
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

const bingLimiter = new RateLimiter(5000);
const hnLimiter = new RateLimiter(1000);

export async function searchBing(query: string): Promise<SearchResult[]> {
  await bingLimiter.wait();
  try {
    const response = await searchAxios.get('https://www.bing.com/search', {
      params: { q: query, count: 20 },
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('li.b_algo').each((_, element) => {
      const titleElement = $(element).find('h2 a');
      const title = titleElement.text().trim();
      const url = titleElement.attr('href');
      const snippet = $(element).find('.b_caption p').text().trim();
      if (title && url && url.startsWith('http')) {
        results.push({ title, content: snippet || title, url, source: 'bing' });
      }
    });

    return results;
  } catch (error) {
    console.error('Bing search error:', error instanceof Error ? error.message : error);
    return [];
  }
}

interface HNSearchHit {
  objectID: string; title: string; url: string | null;
  story_text: string | null; author: string; points: number;
  num_comments: number; created_at: string;
}
interface HNSearchResponse { hits: HNSearchHit[] }

export async function searchHackerNews(query: string): Promise<SearchResult[]> {
  await hnLimiter.wait();
  try {
    const oneDayAgo = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);
    const response = await searchAxios.get<HNSearchResponse>('https://hn.algolia.com/api/v1/search', {
      params: {
        query, tags: 'story', hitsPerPage: 20,
        numericFilters: `created_at_i>${oneDayAgo}`
      },
      timeout: 15000
    });

    return response.data.hits
      .filter(hit => hit.url || hit.story_text)
      .map(hit => ({
        title: hit.title,
        content: hit.story_text || hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: 'hackernews' as const,
        sourceId: hit.objectID,
        publishedAt: new Date(hit.created_at),
        score: hit.points,
        commentCount: hit.num_comments,
        author: { name: hit.author, username: hit.author }
      }));
  } catch (error) {
    console.error('HackerNews search error:', error instanceof Error ? error.message : error);
    return [];
  }
}
