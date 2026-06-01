// 上传文件校验工具
// 包含 MIME/扩展名双校验、文件名 sanitization、magic number 校验

export const MEDIA_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
] as const;

export const DOCUMENT_ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export const MEDIA_MAX_SIZE = 20 * 1024 * 1024; // 20MB
export const VIDEO_MAX_SIZE = 100 * 1024 * 1024; // 100MB
export const DOCUMENT_MAX_SIZE = 20 * 1024 * 1024; // 20MB

// 文件扩展名 → MIME 映射（仅用于反向校验：从前端传来的文件做兜底）
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

const ALLOWED_EXTS = new Set(Object.keys(EXT_TO_MIME));

export function sanitizeFilename(name: string): string {
  // 去掉路径分隔符、控制字符、保留扩展名
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot >= 0 ? name.slice(lastDot + 1) : '';
  const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
  const cleaned = base
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 100);
  return ext ? `${cleaned}.${ext}` : cleaned;
}

export function getExtension(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isExtensionAllowed(ext: string): boolean {
  return ALLOWED_EXTS.has(ext);
}

// Magic number 校验：返回 true 表示通过（无法校验时按通过处理）
export async function verifyMagicNumber(
  file: File,
  declaredMime: string
): Promise<boolean> {
  // 文本类直接通过
  if (declaredMime === 'text/plain' || declaredMime === 'text/markdown') {
    return true;
  }

  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

    if (declaredMime === 'application/pdf') {
      return (
        head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
      );
    }
    if (
      declaredMime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // DOCX = ZIP: PK\x03\x04
      return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    }
    if (declaredMime === 'image/jpeg') {
      return head[0] === 0xff && head[1] === 0xd8;
    }
    if (declaredMime === 'image/png') {
      return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    }
    if (declaredMime === 'image/gif') {
      const sig = String.fromCharCode(head[0], head[1], head[2], head[3], head[4], head[5]);
      return sig === 'GIF87a' || sig === 'GIF89a';
    }
    if (declaredMime === 'image/webp') {
      // RIFF....WEBP
      const riff = String.fromCharCode(head[0], head[1], head[2], head[3]);
      const webp = String.fromCharCode(head[8], head[9], head[10], head[11]);
      return riff === 'RIFF' && webp === 'WEBP';
    }
    if (declaredMime === 'video/mp4' || declaredMime === 'video/quicktime') {
      // MP4/MOV: 第 4-7 字节为 'ftyp'
      const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
      return ftyp === 'ftyp';
    }
    if (declaredMime === 'audio/mpeg') {
      // MP3: ID3 标记 或 0xFF 0xFB/0xFA/0xF3/0xF2 同步字节
      if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true;
      return head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    }
    if (declaredMime === 'audio/wav') {
      const riff = String.fromCharCode(head[0], head[1], head[2], head[3]);
      const wave = String.fromCharCode(head[8], head[9], head[10], head[11]);
      return riff === 'RIFF' && wave === 'WAVE';
    }
    // 未知类型：放行（白名单已经过滤过 MIME）
    return true;
  } catch (e) {
    console.error('[upload] magic number 校验失败:', e);
    // 读取失败时按通过处理，让 storage 层兜底
    return true;
  }
}

export interface SizeCheckResult {
  ok: boolean;
  maxMB: number;
}

export function checkMediaSize(file: File, kind: 'image' | 'video' | 'audio' = 'image'): SizeCheckResult {
  const isVideo = kind === 'video' || file.type.startsWith('video');
  const max = isVideo ? VIDEO_MAX_SIZE : MEDIA_MAX_SIZE;
  return { ok: file.size <= max, maxMB: isVideo ? 100 : 20 };
}

export function checkDocumentSize(file: File): SizeCheckResult {
  return { ok: file.size <= DOCUMENT_MAX_SIZE, maxMB: 20 };
}
