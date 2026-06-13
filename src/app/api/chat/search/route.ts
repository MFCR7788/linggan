// 对话搜索 API — 语义搜索历史对话消息
// GET /api/chat/search?q=搜索关键词&limit=5&threshold=0.7
// 使用 pgvector search_chat_history RPC，需要 chat_message_embeddings 表已填充

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { generateEmbedding } from '@/lib/assistant/embedding';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20);
  const threshold = parseFloat(searchParams.get('threshold') || '0.7');

  if (!query || query.trim().length === 0) {
    return createApiError('搜索关键词不能为空', 400);
  }

  try {
    // 生成查询 embedding
    let embedding: number[];
    try {
      embedding = await generateEmbedding(query.trim());
    } catch (e) {
      console.warn('[ChatSearch] embedding 生成失败:', e);
      return createApiError('搜索服务暂不可用，请稍后重试', 503);
    }

    if (!embedding || embedding.length === 0) {
      return createApiError('搜索服务暂不可用', 503);
    }

    // 调用 search_chat_history RPC（migration 019 定义）
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('search_chat_history', {
      p_user_id: user.id,
      p_query_embedding: embedding,
      p_limit: limit,
      p_similarity_threshold: threshold,
    });

    if (error) {
      console.error('[ChatSearch] RPC 调用失败:', error.message);
      return createApiError('搜索失败', 500);
    }

    return createApiResponse({
      query: query.trim(),
      results: (data || []).map((r: any) => ({
        messageId: r.message_id,
        sessionId: r.session_id,
        content: r.content,
        type: r.type,
        createdAt: r.created_at,
        similarity: Math.round(r.similarity * 100) / 100,
      })),
      count: (data || []).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ChatSearch] 异常:', msg);
    return createApiError('搜索失败', 500);
  }
});
