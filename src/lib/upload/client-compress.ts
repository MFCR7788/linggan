// 客户端图片压缩
// 跳过 gif（动图会失真）和已 < 2MB 的图
'use client';

import imageCompression from 'browser-image-compression';

const SKIP_MIME = new Set(['image/gif']);
const SIZE_THRESHOLD = 2 * 1024 * 1024; // 2MB

export interface CompressResult {
  file: File;
  compressed: boolean;
  reason?: 'gif_skipped' | 'too_small' | 'compressed';
}

export async function compressImageIfNeeded(file: File): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) {
    return { file, compressed: false, reason: 'too_small' };
  }
  if (SKIP_MIME.has(file.type)) {
    return { file, compressed: false, reason: 'gif_skipped' };
  }
  if (file.size <= SIZE_THRESHOLD) {
    return { file, compressed: false, reason: 'too_small' };
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 1920,
      initialQuality: 0.82,
      useWebWorker: true,
      fileType: file.type as any,
    });
    return { file: compressed, compressed: true, reason: 'compressed' };
  } catch (e) {
    console.warn('[compress] 压缩失败，使用原图:', e);
    return { file, compressed: false, reason: 'too_small' };
  }
}
