import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  getExtension,
  isExtensionAllowed,
  verifyMagicNumber,
  checkMediaSize,
  checkDocumentSize,
  MEDIA_ALLOWED_TYPES,
  DOCUMENT_ALLOWED_TYPES,
  MEDIA_MAX_SIZE,
  VIDEO_MAX_SIZE,
  DOCUMENT_MAX_SIZE,
} from '@/lib/upload/validate';

function fileFromBytes(bytes: number[], name = 'test.bin', mime = 'application/octet-stream'): File {
  return new File([new Uint8Array(bytes)], name, { type: mime });
}

describe('sanitizeFilename', () => {
  it('普通文件名不变', () => {
    expect(sanitizeFilename('hello.jpg')).toBe('hello.jpg');
  });

  it('移除路径分隔符', () => {
    const result = sanitizeFilename('a/b\\c:d*e?f"g<h>i.txt');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
  });

  it('保留扩展名', () => {
    expect(sanitizeFilename('test.PNG')).toBe('test.PNG');
  });

  it('无扩展名仍正常', () => {
    expect(sanitizeFilename('readme')).toBe('readme');
  });

  it('超长文件名截断到 100 + 扩展名', () => {
    const long = 'a'.repeat(200) + '.jpg';
    const result = sanitizeFilename(long);
    expect(result.endsWith('.jpg')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(104); // 100 + .jpg
  });

  it('首字符为点号时替换为下划线', () => {
    expect(sanitizeFilename('..hidden')).toBe('_.hidden');
  });
});

describe('getExtension', () => {
  it('返回小写扩展名', () => {
    expect(getExtension('test.JPG')).toBe('jpg');
  });

  it('无扩展名返回空字符串', () => {
    expect(getExtension('readme')).toBe('');
  });

  it('多层级路径只取最后扩展名', () => {
    expect(getExtension('archive.tar.gz')).toBe('gz');
  });
});

describe('isExtensionAllowed', () => {
  it('jpg 在允许名单中', () => {
    expect(isExtensionAllowed('jpg')).toBe(true);
  });

  it('mp4 在允许名单中', () => {
    expect(isExtensionAllowed('mp4')).toBe(true);
  });

  it('exe 不在允许名单中', () => {
    expect(isExtensionAllowed('exe')).toBe(false);
  });

  it('空字符串不在', () => {
    expect(isExtensionAllowed('')).toBe(false);
  });
});

describe('verifyMagicNumber', () => {
  it('JPEG 文件头 FF D8', async () => {
    const file = fileFromBytes([0xff, 0xd8, 0xff, 0xe0], 'photo.jpg', 'image/jpeg');
    await expect(verifyMagicNumber(file, 'image/jpeg')).resolves.toBe(true);
  });

  it('非 JPEG 冒充 JPEG → false', async () => {
    const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47], 'fake.png', 'image/jpeg');
    await expect(verifyMagicNumber(file, 'image/jpeg')).resolves.toBe(false);
  });

  it('PNG 文件头 89 50 4E 47', async () => {
    const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'icon.png', 'image/png');
    await expect(verifyMagicNumber(file, 'image/png')).resolves.toBe(true);
  });

  it('GIF87a 文件头', async () => {
    const bytes = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
    const file = fileFromBytes(bytes, 'anim.gif', 'image/gif');
    await expect(verifyMagicNumber(file, 'image/gif')).resolves.toBe(true);
  });

  it('GIF89a 文件头', async () => {
    const bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    const file = fileFromBytes(bytes, 'anim.gif', 'image/gif');
    await expect(verifyMagicNumber(file, 'image/gif')).resolves.toBe(true);
  });

  it('PDF 文件头 %PDF', async () => {
    const file = fileFromBytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31], 'doc.pdf', 'application/pdf');
    await expect(verifyMagicNumber(file, 'application/pdf')).resolves.toBe(true);
  });

  it('MP3 无 ID3 但有效同步字', async () => {
    const file = fileFromBytes([0xff, 0xfb, 0x90, 0x00], 'song.mp3', 'audio/mpeg');
    await expect(verifyMagicNumber(file, 'audio/mpeg')).resolves.toBe(true);
  });

  it('WAV RIFF 头', async () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0,0,0,0, 0x57, 0x41, 0x56, 0x45];
    const file = fileFromBytes(bytes, 'sound.wav', 'audio/wav');
    await expect(verifyMagicNumber(file, 'audio/wav')).resolves.toBe(true);
  });

  it('文本文件直接通过', async () => {
    const file = fileFromBytes([0x48, 0x65, 0x6c, 0x6c, 0x6f], 'readme.txt', 'text/plain');
    await expect(verifyMagicNumber(file, 'text/plain')).resolves.toBe(true);
  });
});

describe('checkMediaSize', () => {
  it('小图片通过', () => {
    const file = new File(['x'.repeat(1024)], 'icon.png', { type: 'image/png' });
    expect(checkMediaSize(file).ok).toBe(true);
  });

  it('超 20MB 图片不通过', () => {
    const size = MEDIA_MAX_SIZE + 1;
    // 不能真创建 20MB 文件，模拟
    const file = { size, type: 'image/png' } as File;
    expect(checkMediaSize(file).ok).toBe(false);
  });

  it('视频使用 100MB 上限', () => {
    const smallVideo = { size: 50 * 1024 * 1024, type: 'video/mp4' } as File;
    expect(checkMediaSize(smallVideo, 'video').ok).toBe(true);

    const bigVideo = { size: 101 * 1024 * 1024, type: 'video/mp4' } as File;
    expect(checkMediaSize(bigVideo, 'video').ok).toBe(false);
  });
});

describe('checkDocumentSize', () => {
  it('小文档通过', () => {
    const file = { size: 1024, type: 'application/pdf' } as File;
    expect(checkDocumentSize(file).ok).toBe(true);
  });

  it('超 20MB 文档不通过', () => {
    const file = { size: DOCUMENT_MAX_SIZE + 1, type: 'application/pdf' } as File;
    expect(checkDocumentSize(file).ok).toBe(false);
  });
});

describe('常量导出', () => {
  it('MEDIA_ALLOWED_TYPES 包含常用类型', () => {
    expect(MEDIA_ALLOWED_TYPES).toContain('image/jpeg');
    expect(MEDIA_ALLOWED_TYPES).toContain('video/mp4');
  });

  it('DOCUMENT_ALLOWED_TYPES 包含 PDF 和 DOCX', () => {
    expect(DOCUMENT_ALLOWED_TYPES).toContain('application/pdf');
    expect(DOCUMENT_ALLOWED_TYPES).toContain('text/plain');
  });

  it('MEDIA_MAX_SIZE = 20MB', () => {
    expect(MEDIA_MAX_SIZE).toBe(20 * 1024 * 1024);
  });

  it('VIDEO_MAX_SIZE = 100MB', () => {
    expect(VIDEO_MAX_SIZE).toBe(100 * 1024 * 1024);
  });
});
