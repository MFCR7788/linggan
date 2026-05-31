import { callDeepSeek } from '../ai-services';

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
