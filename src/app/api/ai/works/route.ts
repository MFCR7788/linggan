// 作品管理 API — 单条删除 + 批量删除（chat_messages 硬删除 / content_items 软删除）
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// DELETE /api/ai/works?id=xxx&source=chat|content_item
export const DELETE = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const source = searchParams.get('source');

  if (!id || !source) {
    return createApiError('缺少 id 或 source 参数', 400);
  }

  const supabase = createAdminClient();

  if (source === 'chat') {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Works] 删除 chat_messages 失败:', error);
      return createApiError('删除失败', 500);
    }
    return createApiResponse({ deleted: true }, '删除成功');
  }

  if (source === 'content_item') {
    const { error } = await supabase
      .from('content_items')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Works] 删除 content_items 失败:', error);
      return createApiError('删除失败', 500);
    }
    return createApiResponse({ deleted: true }, '删除成功');
  }

  return createApiError('无效的 source 参数', 400);
});

// POST /api/ai/works — 批量删除
// Body: { ids: [{ id: string, source: 'chat' | 'content_item' }] }
export const POST = withAuth(async ({ request, user }) => {
  const { ids } = await request.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return createApiError('请选择要删除的作品', 400);
  }

  if (ids.length > 100) {
    return createApiError('单次最多删除 100 条', 400);
  }

  const supabase = createAdminClient();
  const chatIds = ids.filter((i: any) => i.source === 'chat').map((i: any) => i.id);
  const contentIds = ids.filter((i: any) => i.source === 'content_item').map((i: any) => i.id);

  let deletedCount = 0;

  if (chatIds.length > 0) {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .in('id', chatIds)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Works] 批量删除 chat_messages 失败:', error);
    } else {
      deletedCount += chatIds.length;
    }
  }

  if (contentIds.length > 0) {
    const { error } = await supabase
      .from('content_items')
      .update({ status: 'deleted' })
      .in('id', contentIds)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Works] 批量删除 content_items 失败:', error);
    } else {
      deletedCount += contentIds.length;
    }
  }

  if (deletedCount === 0) {
    return createApiError('删除失败', 500);
  }

  return createApiResponse({ deleted: deletedCount }, `成功删除 ${deletedCount} 条作品`);
});
