// Agent 工具共用 — 生成内容自动保存到灵感库
import { createAdminClient } from '@/lib/supabase-server';
import { indexContentItem } from '@/lib/assistant/embedding';
import { downloadAndUploadToStorage } from '@/lib/storage/media-downloader';

const TYPE_TO_CATEGORY: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

export async function saveMediaToInspiration(
  userId: string,
  type: 'image' | 'video' | 'audio',
  prompt: string,
  mediaUrls: string[],
  options?: { sourcePlatform?: string; tags?: string[]; toolName?: string }
): Promise<void> {
  try {
    const supabase = createAdminClient();

    // 查找或创建对应分类
    const catName = TYPE_TO_CATEGORY[type] || '灵感';
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', catName)
      .maybeSingle();

    let categoryId = cat?.id || null;
    if (!categoryId) {
      const { data: newCat } = await supabase
        .from('categories')
        .insert({ user_id: userId, name: catName, icon: type === 'image' ? '🖼️' : type === 'video' ? '🎬' : '🎵', color: '#3B82F6', sort_order: 0 })
        .select('id')
        .single();
      categoryId = newCat?.id || null;
    }

    const title = prompt.length > 50 ? prompt.slice(0, 50) : prompt;

    const mediaTypeLabel = type === 'image' ? 'AI生图' : type === 'video' ? 'AI视频' : 'AI音频';
    const defaultTags = options?.tags || [
      'source:ai',
      options?.toolName ? `tool:${options.toolName}` : `tool:${type}`,
      mediaTypeLabel,
      'AI生成',
    ];
    const tags = defaultTags;

    // 将临时 AI 生成 URL 转为永久 Supabase Storage URL
    const permanentUrls = mediaUrls.length > 0
      ? await Promise.all(mediaUrls.map(async (url) => {
          const permanent = await downloadAndUploadToStorage(url, { folder: type });
          return permanent || url;
        }))
      : [];

    const { data: item, error } = await supabase
      .from('content_items')
      .insert({
        user_id: userId,
        type,
        title,
        original_text: prompt,
        prompt,
        category_id: categoryId,
        media_urls: permanentUrls.length > 0 ? permanentUrls : null,
        source_platform: options?.sourcePlatform || 'ai',
        status: 'active',
        analysis_status: 'completed',
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[saveMediaToInspiration] 插入失败:', error.message);
      return;
    }

    // 批量创建标签关联
    if (item?.id && tags.length > 0) {
      const { data: existing } = await supabase
        .from('tags')
        .select('id, name')
        .eq('user_id', userId)
        .in('name', tags);

      const existingMap = new Map((existing || []).map((t: any) => [t.name, t.id]));
      const newNames = tags.filter((n) => !existingMap.has(n));

      if (newNames.length > 0) {
        const { data: created } = await supabase
          .from('tags')
          .insert(newNames.map((name) => ({ user_id: userId, name })))
          .select('id, name');
        (created || []).forEach((t: any) => existingMap.set(t.name, t.id));
      }

      const rows = tags
        .map((name) => ({ content_id: item.id, tag_id: existingMap.get(name) }))
        .filter((r) => r.tag_id);

      if (rows.length > 0) {
        await supabase.from('content_tags').insert(rows);
      }
    }

    // 异步生成向量嵌入（fire-and-forget，不阻塞工具响应）
    if (item?.id) {
      indexContentItem(item.id, userId, prompt).catch(
        (e) => console.warn('[saveMediaToInspiration] 向量嵌入失败:', e)
      );
    }
  } catch (e) {
    console.warn('[saveMediaToInspiration] 保存失败:', e);
  }
}
