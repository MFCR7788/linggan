// Chat route 辅助函数 — 从 977 行 route handler 中提取
// 链接检测 + 文档抽取逻辑，减少 route 文件体积

import { createAdminClient } from '@/lib/supabase-server';
import { extractTextFromBuffer } from '@/lib/extract/document-extractor';

// 链接内容分析结果
export interface LinkContext {
  linkType: 'article' | 'image' | 'video';
  title: string;
  extractedContent: string;
  mediaUrl?: string;
  tags: string[];
  sourceUrl: string;
  sourcePlatform: string;
  transcript?: string;
}

// 平台域名映射
const PLATFORM_MAP: Record<string, string> = {
  weibo: '微博', zhihu: '知乎', xiaohongshu: '小红书',
  douyin: '抖音', bilibili: 'B站',
};

function detectPlatform(hostname: string): string {
  for (const [k, v] of Object.entries(PLATFORM_MAP)) {
    if (hostname.includes(k)) return v;
  }
  return hostname;
}

// URL 模式：检测是否为链接
const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;

export function isLinkInput(content: string): boolean {
  const trimmed = content.trim();
  return URL_PATTERN.test(trimmed) || trimmed.startsWith('http') || trimmed.startsWith('www.');
}

export function normalizeUrl(content: string): string {
  const trimmed = content.trim();
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

// 分析链接内容（调用内部 API）
export async function analyzeLink(
  requestUrl: string,
  normalizedUrl: string
): Promise<LinkContext | null> {
  try {
    const hostname = normalizedUrl.replace('https://', '').replace('http://', '').split('/')[0];
    const sourcePlatform = detectPlatform(hostname);

    const linkRes = await fetch(new URL('/api/ai/analyze-link', requestUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalizedUrl }),
    });
    const linkData = await linkRes.json();

    return {
      linkType: linkData.linkType || 'article',
      title: linkData.title || '链接内容',
      extractedContent: linkData.summary || linkData.keyPoints?.join('；') || '',
      mediaUrl: linkData.mediaUrl,
      tags: linkData.tags || [],
      sourceUrl: normalizedUrl,
      sourcePlatform,
      transcript: linkData.transcript || undefined,
    };
  } catch (e) {
    console.warn('链接分析失败，降级为文本处理:', e);
    return null;
  }
}

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

// 从 Supabase storage 下载并抽取文档文本
export async function extractDocuments(
  documents: string[],
  userId: string,
  supabaseUrl: string
): Promise<string[]> {
  if (!documents || documents.length === 0) return [];

  const supabase = createAdminClient();
  const results: string[] = [];

  for (const docUrl of documents) {
    try {
      if (typeof docUrl !== 'string' || docUrl.length > 500) continue;

      const url = new URL(docUrl);
      if (supabaseUrl && !url.hostname.includes(new URL(supabaseUrl).hostname)) continue;

      const parts = url.pathname.split('/').filter(Boolean);
      const publicIdx = parts.indexOf('public');
      if (publicIdx === -1 || publicIdx + 2 >= parts.length) continue;

      const bucket = parts[publicIdx + 1];
      const storagePath = parts.slice(publicIdx + 2).join('/');
      if (!storagePath.startsWith(`${userId}/`)) continue;

      const ext = storagePath.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_MAP[ext];
      if (!mimeType) continue;

      const { data, error } = await supabase.storage.from(bucket).download(storagePath);
      if (error || !data) continue;

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await extractTextFromBuffer(buffer, mimeType);
      if (result.text) {
        const label = ext === 'pdf' ? 'PDF' : ext === 'docx' ? 'DOCX' : ext.toUpperCase();
        results.push(`[${label} 文档内容]\n${result.text}`);
      }
    } catch (e) {
      console.warn(`文档抽取失败 (${docUrl}):`, e);
    }
  }

  return results;
}
