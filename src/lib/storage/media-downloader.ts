// 将临时 AI 生成 URL 下载并上传到 Supabase Storage，返回永久公开 URL
import { createAdminClient } from '@/lib/supabase-server';

const BUCKET = 'lingji-media';
const DEFAULT_TIMEOUT = 30000;
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

interface DownloadOptions {
  folder?: string;
  timeout?: number;
  maxSize?: number;
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
  };
  return map[contentType] || 'bin';
}

export async function downloadAndUploadToStorage(
  sourceUrl: string,
  options: DownloadOptions = {}
): Promise<string | null> {
  const { folder = 'ai-generated', timeout = DEFAULT_TIMEOUT, maxSize = MAX_SIZE } = options;

  try {
    // 跳过已经是 Supabase Storage 的 URL
    if (sourceUrl.includes('supabase.co/storage/v1/object/public/')) {
      return sourceUrl;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxSize) return null;

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const ext = getExtension(contentType);
    const fileName = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, Buffer.from(arrayBuffer), { contentType, upsert: false });

    if (error) {
      console.warn('[media-downloader] 上传失败:', error.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return publicUrl;
  } catch (e) {
    console.warn('[media-downloader] 下载/上传失败:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
