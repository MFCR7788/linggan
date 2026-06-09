// 知识库 API — 多源知识检索
// GET /api/assistant/knowledge?query=xxx

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { KnowledgeManager } from '@/lib/assistant/knowledge/manager';
import { InspirationKnowledgeProvider } from '@/lib/assistant/knowledge/inspiration-provider';
import { PublicKnowledgeProvider } from '@/lib/assistant/knowledge/public-provider';
import { WebSearchProvider } from '@/lib/assistant/knowledge/web-search-provider';
import { generateEmbedding } from '@/lib/assistant/embedding';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) return createApiError('缺少 query 参数', 400);

  try {
    const embedding = await generateEmbedding(query).catch(() => []);

    const mgr = new KnowledgeManager();
    mgr.addProvider(new InspirationKnowledgeProvider(user.id));
    mgr.addProvider(new PublicKnowledgeProvider());
    mgr.addProvider(new WebSearchProvider());

    const result = await mgr.search(query, embedding, user.id);

    return createApiResponse(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});
