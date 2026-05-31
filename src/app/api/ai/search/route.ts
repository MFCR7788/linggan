import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ success: false, error: '请输入搜索关键词' }, { status: 400 });
    }

    const results = await searchWeb(query);
    return NextResponse.json({ success: true, results, query });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ success: false, error: '搜索失败' }, { status: 500 });
  }
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpGet(res.headers.location));
        return;
      }
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function(this: any) { this.destroy(); reject(new Error('Timeout')); });
  });
}

function extractResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // 提取每个 b_algo 块
  const blocks = html.match(/<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi) || [];

  for (const block of blocks) {
    // 提取标题和 URL
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    if (!titleMatch) continue;
    const url = titleMatch[1];
    if (url.startsWith('#')) continue;
    const title = titleMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    // 提取摘要
    const snippetMatch = block.match(/<div[^>]*class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : '';

    results.push({ title, url, snippet });
  }

  return results.slice(0, 8);
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
  const html = await httpGet(url);
  return extractResults(html);
}
