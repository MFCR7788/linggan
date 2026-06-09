// 记忆 API — CRUD 用户记忆
// GET  /api/assistant/memory?action=list|search&query=&category=
// POST /api/assistant/memory — 创建记忆
// DELETE /api/assistant/memory?id=xxx — 删除记忆

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { BuiltinMemoryProvider } from '@/lib/assistant/memory/builtin-provider';
import { generateEmbedding } from '@/lib/assistant/embedding';

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const query = searchParams.get('query');
  const category = searchParams.get('category');

  try {
    const builtin = new BuiltinMemoryProvider();
    await builtin.initialize(user.id);

    if (action === 'search' && query) {
      const embedding = await generateEmbedding(query).catch(() => []);
      const results = await builtin.prefetch(query, embedding);
      return createApiResponse(results);
    }

    if (category) {
      const results = await builtin.getByCategory(category);
      return createApiResponse(results);
    }

    const results = await builtin.getAll();
    return createApiResponse(results);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await request.json();
    const { value, category = 'general', key, importance = 1 } = body;

    if (!value || typeof value !== 'string') {
      return createApiError('value 不能为空', 400);
    }

    const builtin = new BuiltinMemoryProvider();
    await builtin.initialize(user.id);

    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(value);
    } catch { /* 降级 */ }

    const entry = await builtin.save({
      userId: user.id,
      category,
      key,
      value,
      importance,
      embedding,
    });

    return createApiResponse(entry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});

export const DELETE = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return createApiError('缺少 id 参数', 400);

  try {
    const builtin = new BuiltinMemoryProvider();
    await builtin.initialize(user.id);
    await builtin.delete(id);
    return createApiResponse({ deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});
