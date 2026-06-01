import axios from 'axios';
import * as cheerio from 'cheerio';
import { callDeepSeek } from '../ai-services';
import { SearchResult, HotListItem } from '../search/types';

/**
 * 查询扩展缓存
 */
const expansionCache = new Map<string, string[]>();

/**
 * 使用 AI 将关键词扩展为多个变体
 */
export async function expandKeyword(keyword: string): Promise<string[]> {
  if (expansionCache.has(keyword)) {
    return expansionCache.get(keyword)!;
  }

  const coreTerms = extractCoreTerms(keyword);

  try {
    const content = await callDeepSeek(`你是一个搜索查询扩展专家。给定一个监控关键词，生成该关键词的变体和相关检索词。

规则：
1. 包含原始关键词的各种写法（大小写、空格、连字符变体）
2. 包含关键词的核心组成词（拆分后的各个有意义的词）
3. 包含常见别称、缩写、中英文对照
4. 不要加入泛化词
5. 总数控制在 5-15 个

输出 JSON 数组，只输出 JSON。
关键词：${keyword}`, { temperature: 0.2, maxTokens: 300 });

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: string[] = JSON.parse(jsonMatch[0]);
      const expanded = [...new Set([keyword, ...coreTerms, ...parsed.map(s => s.trim()).filter(Boolean)])];
      expansionCache.set(keyword, expanded);
      return expanded;
    }
  } catch (error) {
    console.error('Query expansion failed:', error instanceof Error ? error.message : error);
  }

  const fallback = [keyword, ...coreTerms];
  expansionCache.set(keyword, fallback);
  return fallback;
}

function extractCoreTerms(keyword: string): string[] {
  const terms: string[] = [];
  const parts = keyword.split(/[\s\-_\/\\·]+/).filter(p => p.length >= 2);
  if (parts.length > 1) {
    terms.push(...parts);
    for (let i = 0; i < parts.length - 1; i++) {
      terms.push(parts[i] + ' ' + parts[i + 1]);
    }
  }
  return [...new Set(terms)].filter(t => t.toLowerCase() !== keyword.toLowerCase());
}

/**
 * 文本预匹配：检查文本中是否包含任一扩展关键词
 */
export function preMatchKeyword(text: string, expandedKeywords: string[]): { matched: boolean; matchedTerms: string[] } {
  const lowerText = text.toLowerCase();
  const matchedTerms: string[] = [];
  for (const kw of expandedKeywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      matchedTerms.push(kw);
    }
  }
  return { matched: matchedTerms.length > 0, matchedTerms };
}

/**
 * 将热榜条目与扩展关键词做本地匹配，返回匹配成功的 SearchResult[]
 */
export function matchHotListAgainstKeywords(
  hotItems: HotListItem[],
  expandedKeywords: string[],
  source: 'weibo' | 'zhihu' | 'baidu' | 'douyin' | 'toutiao'
): SearchResult[] {
  const matched: SearchResult[] = [];
  for (const item of hotItems) {
    const combinedText = `${item.title} ${item.content}`;
    const preMatch = preMatchKeyword(combinedText, expandedKeywords);
    if (preMatch.matched) {
      matched.push({
        title: item.title,
        content: item.content || item.title,
        url: item.url,
        source,
        sourceId: item.topicId,
        viewCount: item.hotScore || undefined,
        score: item.hotScore || undefined,
      });
    }
  }
  // 按热度降序
  return matched.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * AI 分析内容与关键词的相关性
 */
export async function analyzeContent(
  content: string,
  keyword: string,
  preMatchResult?: { matched: boolean; matchedTerms: string[] }
): Promise<{ isReal: boolean; relevance: number; relevanceReason: string; keywordMentioned: boolean; importance: string; summary: string }> {
  const matchResult = preMatchResult ?? { matched: false, matchedTerms: [] };

  const matchHint = matchResult.matched
    ? `\n注意：文本预匹配发现内容中包含以下关键词变体：${matchResult.matchedTerms.join('、')}`
    : `\n注意：文本预匹配发现内容中未直接提及关键词"${keyword}"的任何变体，请特别严格审核相关性。`;

  try {
    const prompt = `你是一个热点内容精准匹配专家。判断以下内容是否与监控关键词【${keyword}】直接相关。

${matchHint}

分析要点：
1. 判断是否为真实有价值的信息（排除标题党、假新闻、营销软文）
2. 判断内容是否【直接】涉及关键词"${keyword}"
3. 判断内容中是否直接提及了"${keyword}"或其等价表述（keywordMentioned）
4. 评估热点的重要程度
5. 用一句话说明此内容与"${keyword}"的关系

请以 JSON 格式输出：
{
  "isReal": true/false,
  "relevance": 0-100,
  "relevanceReason": "相关性打分理由",
  "keywordMentioned": true/false,
  "importance": "low/medium/high/urgent",
  "summary": "此内容与【${keyword}】的关联"
}

内容：${content.slice(0, 2000)}
只输出 JSON，不要有其他内容。`;

    const result = await callDeepSeek(prompt, { temperature: 0.2, maxTokens: 500 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isReal: Boolean(parsed.isReal),
        relevance: Math.min(100, Math.max(0, Number(parsed.relevance) || 0)),
        relevanceReason: String(parsed.relevanceReason || '').slice(0, 200),
        keywordMentioned: Boolean(parsed.keywordMentioned),
        importance: ['low', 'medium', 'high', 'urgent'].includes(parsed.importance) ? parsed.importance : 'low',
        summary: String(parsed.summary || '').slice(0, 150),
      };
    }
    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('AI analysis failed:', error instanceof Error ? error.message : error);
    return {
      isReal: true,
      relevance: matchResult.matched ? 75 : 55,
      relevanceReason: 'AI 分析失败，使用默认分数',
      keywordMentioned: matchResult.matched,
      importance: matchResult.matched ? 'medium' : 'low',
      summary: content.slice(0, 50) + '...',
    };
  }
}

/**
 * 批量分析
 */
export async function batchAnalyze(
  contents: string[],
  keyword: string,
  expandedKeywords?: string[]
): Promise<any[]> {
  const batchSize = 3;
  const results: any[] = [];

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(content => {
        const preMatch = expandedKeywords ? preMatchKeyword(content, expandedKeywords) : undefined;
        return analyzeContent(content, keyword, preMatch);
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── 页面内容抓取 ────────────────────────────────────────

const fetchAxios = axios.create({ timeout: 15000 });

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 从热点 URL 抓取页面正文文本
 * 不同平台用不同提取策略
 */
export async function fetchPageContent(url: string, source: string): Promise<string> {
  try {
    const res = await fetchAxios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      maxRedirects: 5,
    });

    const html = res.data;
    if (typeof html !== 'string' || html.length < 100) return '';

    const $ = cheerio.load(html);

    // 移除无用元素
    $('script, style, nav, footer, header, aside, .sidebar, .comment, .comments, .ad, .advertisement, .recommend, .related, noscript, iframe, svg').remove();

    let text = '';

    // 平台特定提取
    switch (source) {
      case 'weibo': {
        // 微博正文
        const body = $('.WB_text, .weibo-text, .detail_wbtext_4CRf, .txt');
        text = body.text().trim();
        break;
      }
      case 'zhihu': {
        // 知乎回答/文章
        const article = $('.Post-RichText, .RichContent-inner, .Article-content, .Post-content');
        text = article.text().trim();
        if (!text) {
          // 问题页：取标题+描述
          text = $('.QuestionHeader-title').text().trim() + '\n' + $('.QuestionRichText').text().trim();
        }
        break;
      }
      case 'bilibili': {
        // B站视频简介
        text = $('.video-desc, .video-info-desc, .desc-info-text').text().trim();
        if (!text) {
          text = $('meta[name="description"]').attr('content') || '';
        }
        break;
      }
      case 'baidu':
      case 'sogou': {
        // 百度/搜狗 — 搜索结果页，无法抓原文，用摘要
        text = $('.article, .content, .post-content, .entry-content, article, main, .c-abstract, .content-right_8Zs40').text().trim();
        break;
      }
      case 'douyin':
      case 'toutiao': {
        // 抖音/头条
        text = $('article, .article-content, .content, .detail-content, main').text().trim();
        break;
      }
      default: {
        // 通用提取
        const selectors = ['article', 'main', '.post-content', '.article-content', '.entry-content', '.content', '#content', '.post-body', '.story-body'];
        for (const sel of selectors) {
          const el = $(sel);
          if (el.length > 0 && el.text().trim().length > 100) {
            text = el.text().trim();
            break;
          }
        }
        if (!text) {
          // 最终回退：取 body 文本
          text = $('body').text().trim();
        }
      }
    }

    // 清理：合并空白、限制长度
    text = text.replace(/\s+/g, ' ').trim();
    return text.slice(0, 3000);
  } catch (error) {
    console.error(`fetchPageContent error [${source}] ${url}:`, error instanceof Error ? error.message : error);
    return '';
  }
}

/**
 * AI 对完整页面内容做摘要总结
 * 返回 Markdown 格式的摘要
 */
export async function summarizeHotspot(
  fullContent: string,
  title: string,
  keyword: string
): Promise<string> {
  if (!fullContent || fullContent.length < 30) return '';

  try {
    const prompt = `你是热点内容分析专家。请对以下关于【${keyword}】的热点内容进行总结归纳。

要求：
1. 用 2-4 句话概括核心内容
2. 提炼关键数据和观点
3. 说明此内容与【${keyword}】的关联
4. 语言简洁有力，适合快速阅读

标题：${title}

原文内容：
${fullContent.slice(0, 2500)}`;

    const result = await callDeepSeek(prompt, { temperature: 0.3, maxTokens: 400 });
    return result.trim().slice(0, 300);
  } catch (error) {
    console.error('summarizeHotspot error:', error instanceof Error ? error.message : error);
    // 回退：取原文前 100 字
    return fullContent.replace(/\s+/g, ' ').slice(0, 100) + '...';
  }
}
