// 一次性迁移：将 chat_messages 中的 AI 作品迁移到 content_items
// 访问 GET /api/migrate/ai-works 执行迁移（仅迁移尚未在 content_items 中的记录）

import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ user }) => {
  const supabase = createAdminClient();

  // 1. 获取 chat_messages 中所有 AI 创作记录
  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, content, content_type, metadata, created_at, session_id')
    .eq('user_id', user.id)
    .eq('type', 'ai')
    .contains('metadata', { source: 'ai_creation' })
    .order('created_at', { ascending: false });

  if (msgError) {
    return createApiError('查询 chat_messages 失败: ' + msgError.message, 500);
  }

  if (!messages || messages.length === 0) {
    return createApiResponse({ migrated: 0 }, '没有需要迁移的记录');
  }

  // 2. 获取已存在的 content_items（避免重复）
  const { data: existing } = await supabase
    .from('content_items')
    .select('original_text, media_urls')
    .eq('user_id', user.id)
    .eq('source_platform', 'ai');

  const existingTexts = new Set((existing || []).map((e: any) => e.original_text).filter(Boolean));
  const existingUrls = new Set((existing || []).flatMap((e: any) => e.media_urls || []).filter(Boolean));

  let migrated = 0;
  let skipped = 0;

  for (const msg of messages) {
    const content = msg.content || '';
    const metadata = msg.metadata || {};
    const imageUrl = metadata?.generatedImage?.imageUrl;
    const videoUrl = metadata?.generatedVideo?.videoUrl;
    const mediaUrls = [imageUrl, videoUrl].filter(Boolean);

    // 去重：按内容或媒体 URL
    const contentKey = content.substring(0, 100);
    if (existingTexts.has(contentKey) || mediaUrls.some((u: string) => existingUrls.has(u))) {
      skipped++;
      continue;
    }

    // 确定类型
    let itemType = 'text';
    if (videoUrl) itemType = 'video';
    else if (imageUrl) itemType = 'image';

    // 推断标题
    const title = content
      ? content.replace(/<[^>]*>/g, '').substring(0, 50)
      : (videoUrl ? 'AI 生成视频' : imageUrl ? 'AI 生成图片' : 'AI 生成内容');

    const { error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: user.id,
        type: itemType,
        title,
        original_text: content,
        ai_summary: content ? content.replace(/<[^>]*>/g, '').substring(0, 120) : null,
        source_platform: 'ai',
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        status: 'active',
        analysis_status: 'completed',
        created_at: msg.created_at,
      });

    if (insertError) {
      console.error('迁移失败:', msg.id, insertError.message);
    } else {
      migrated++;
      if (contentKey) existingTexts.add(contentKey);
      mediaUrls.forEach((u: string) => existingUrls.add(u));
    }
  }

  return createApiResponse({ migrated, skipped, total: messages.length }, `迁移完成：${migrated} 条新增，${skipped} 条跳过`);
});
