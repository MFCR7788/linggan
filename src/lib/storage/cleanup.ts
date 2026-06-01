// Storage 对象清理辅助
// 删除灵感时同步删除 storage 中的文件，避免孤儿对象

import { createAdminClient } from '@/lib/supabase-server';

const BUCKET = 'lingji-media';

/**
 * 从 public URL 中提取 storage path
 * 例如：https://xxx.supabase.co/storage/v1/object/public/lingji-media/uploads/abc.jpg
 *  → uploads/abc.jpg
 */
export function extractStoragePath(publicUrl: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx < 0) {
      // 兼容：直接 path 形式
      if (publicUrl.startsWith('uploads/') || publicUrl.startsWith('documents/')) {
        return publicUrl;
      }
      return null;
    }
    return publicUrl.slice(idx + marker.length);
  } catch {
    return null;
  }
}

/**
 * 删除一条灵感关联的所有 storage 对象
 * - media_urls[*]
 * - original_file_url
 * 失败仅记日志，不抛错（避免阻塞 DB 删除）
 */
export async function cleanupContentAssets(item: {
  media_urls?: string[] | null;
  original_file_url?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const paths: string[] = [];

  if (Array.isArray(item.media_urls)) {
    for (const url of item.media_urls) {
      const p = extractStoragePath(url);
      if (p) paths.push(p);
    }
  }
  if (item.original_file_url) {
    const p = extractStoragePath(item.original_file_url);
    if (p) paths.push(p);
  }

  if (paths.length === 0) return;

  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      console.error('[storage/cleanup] 删除失败:', error.message, paths);
    } else {
      console.log(`[storage/cleanup] 已删除 ${paths.length} 个对象`);
    }
  } catch (e) {
    console.error('[storage/cleanup] 异常:', e);
  }
}

/**
 * 批量删除多条灵感的 storage 对象
 */
export async function cleanupContentAssetsBatch(
  items: Array<{ media_urls?: string[] | null; original_file_url?: string | null }>
): Promise<void> {
  await Promise.all(items.map(cleanupContentAssets));
}
