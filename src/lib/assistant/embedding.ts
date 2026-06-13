// Embedding 服务 — DashScope text-embedding-v2 (1536d)
// 用于记忆/灵感/知识库的语义搜索

import { getDashScopeApiKey } from '@/lib/runtime-config';

const EMBEDDING_MODEL = 'text-embedding-v2';
const EMBEDDING_DIM = 1536;
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage: { total_tokens: number };
}

/** 简单 LRU 缓存，避免重复嵌入相同文本 */
const cache = new Map<string, number[]>();
const CACHE_MAX = 500;

function cacheKey(text: string): string {
  return text.length < 200 ? text : text.slice(0, 100) + text.slice(-100);
}

function cacheGet(text: string): number[] | undefined {
  const k = cacheKey(text);
  const v = cache.get(k);
  if (v) {
    // LRU: 移到末尾
    cache.delete(k);
    cache.set(k, v);
  }
  return v;
}

function cacheSet(text: string, embedding: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cacheKey(text), embedding);
}

/** 生成单条文本的 embedding */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cached = cacheGet(text);
  if (cached) return cached;

  const embeddings = await batchEmbed([text]);
  return embeddings[0];
}

/** 批量生成 embedding（最多 25 条/次） */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: (number[] | null)[] = texts.map(() => null);
  const toFetch: { idx: number; text: string }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i].trim();
    if (!t) {
      results[i] = new Array(EMBEDDING_DIM).fill(0);
      continue;
    }
    const cached = cacheGet(t);
    if (cached) {
      results[i] = cached;
    } else {
      toFetch.push({ idx: i, text: t });
    }
  }

  if (toFetch.length === 0) return results as number[][];

  // DashScope 单次最多 25 条
  const batches = chunk(toFetch, 25);
  for (const batch of batches) {
    const batchResults = await batchEmbed(batch.map(b => b.text));
    batch.forEach((item, j) => {
      results[item.idx] = batchResults[j];
      cacheSet(item.text, batchResults[j]);
    });
  }

  return results as number[][];
}

async function batchEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = getDashScopeApiKey();
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY 未配置');

  const response = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Embedding API 失败 (${response.status}): ${err.slice(0, 200)}`);
  }

  const body: EmbeddingResponse = await response.json();
  return body.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

/** 为单个 content_item 生成 embedding 并存入 inspiration_embeddings 表 */
export async function indexContentItem(itemId: string, userId: string, text: string): Promise<number[]> {
  const embedding = await generateEmbedding(text);
  const { createAdminClient } = await import('@/lib/supabase-server');
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('inspiration_embeddings')
    .upsert({
      content_id: itemId,
      user_id: userId,
      embedding,
      indexed_at: new Date().toISOString(),
    }, { onConflict: 'content_id' });

  if (error) console.warn(`[Embedding] 存储 inspiration_embeddings[${itemId}] 失败:`, error.message);
  return embedding;
}

/** 批量为 content_items 建立索引（初始化/迁移用，写入 inspiration_embeddings 表） */
export async function indexContentItemsBatch(
  items: { id: string; userId: string; text: string }[]
): Promise<{ indexed: number; failed: number }> {
  let indexed = 0;
  let failed = 0;

  const batches = chunk(items, 25);
  for (const batch of batches) {
    try {
      const texts = batch.map(i => i.text);
      const embeddings = await generateEmbeddings(texts);

      const { createAdminClient } = await import('@/lib/supabase-server');
      const supabase = createAdminClient();
      const rows = batch.map((item, i) => ({
        content_id: item.id,
        user_id: item.userId,
        embedding: embeddings[i],
        indexed_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('inspiration_embeddings').upsert(rows, { onConflict: 'content_id' });
      if (error) {
        console.warn('[Embedding] 批量写入 inspiration_embeddings 失败:', error.message);
        failed += batch.length;
      } else {
        indexed += batch.length;
      }
    } catch (e) {
      console.warn('[Embedding] 批量索引异常:', e);
      failed += batch.length;
    }
  }

  return { indexed, failed };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
