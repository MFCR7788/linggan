// 中文关键词翻译 — 将中文搜索词翻译为英文关键词
// 复用 DeepSeek 做轻量翻译，不额外调用翻译 API

/** 简单的 LRU 翻译缓存 */
const translationCache = new Map<string, string[]>();
const CACHE_MAX = 200;

function cacheGet(key: string): string[] | undefined {
  const entry = translationCache.get(key);
  if (entry) {
    // LRU: 移到末尾
    translationCache.delete(key);
    translationCache.set(key, entry);
    return entry;
  }
  return undefined;
}

function cacheSet(key: string, value: string[]): void {
  if (translationCache.size >= CACHE_MAX) {
    const first = translationCache.keys().next().value;
    if (first) translationCache.delete(first);
  }
  translationCache.set(key, value);
}

/** 判断文本是否包含中文 */
function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/**
 * 从中文搜索词提取英文关键词
 * - 如果输入已经是纯英文/关键词，直接返回
 * - 如果包含中文，用 AI 提取 3-8 个英文关键词
 */
export async function extractSearchKeywords(
  chineseQuery: string
): Promise<string[]> {
  const trimmed = chineseQuery.trim();
  if (!trimmed) return [];

  // 检查缓存
  const cached = cacheGet(trimmed);
  if (cached) return cached;

  // 如果不含中文，直接拆分为多个关键词
  if (!containsChinese(trimmed)) {
    const keywords = trimmed
      .split(/[,，\s]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);
    cacheSet(trimmed, keywords.length > 0 ? keywords : [trimmed]);
    return keywords.length > 0 ? keywords : [trimmed];
  }

  // 中文输入 → AI 翻译为英文关键词
  try {
    const keywords = await translateWithAI(trimmed);
    cacheSet(trimmed, keywords);
    return keywords;
  } catch (e) {
    console.warn('[keyword-translator] AI 翻译失败，使用原始输入:', e);
    return [trimmed];
  }
}

async function translateWithAI(chineseText: string): Promise<string[]> {
  // 直接用 fetch 调用 DeepSeek，不依赖复杂的 LLM 抽象
  const apiKey = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getDeepSeekApiKey } = require('@/lib/runtime-config');
      return getDeepSeekApiKey() || process.env.DEEPSEEK_API_KEY || '';
    } catch {
      return process.env.DEEPSEEK_API_KEY || '';
    }
  })();

  if (!apiKey) {
    // 无 API Key，直接返回中文分词
    return [chineseText];
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are a keyword translator for stock media search. Extract 3-8 English keywords from the Chinese input. Return ONLY comma-separated English keywords, nothing else. Focus on visual subjects, scenes, moods. Example: "一只坐在草地上的小猫" → "cat, sitting, grass, cute pet, outdoor, sunshine"',
        },
        { role: 'user', content: chineseText },
      ],
      temperature: 0.3,
      max_tokens: 60,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content
    .split(/[,，\n]+/)
    .map((k: string) => k.trim())
    .filter((k: string) => k.length > 0 && k.length < 50)
    .slice(0, 8);
}
