// 文档文本抽取
// 统一封装 PDF/DOCX/TXT/MD 的文本抽取
// 服务端从 storage 拉字节流 → 转 Buffer → 走对应解析器

import mammoth from 'mammoth';

export const MAX_EXTRACTED_CHARS = 50000;

export type ExtractionCode = 'FETCH_FAILED' | 'PARSE_FAILED' | 'EMPTY' | 'TOO_LARGE';

export class ExtractionError extends Error {
  code: ExtractionCode;
  constructor(message: string, code: ExtractionCode) {
    super(message);
    this.code = code;
  }
}

export interface ExtractionResult {
  text: string;
  chars: number;
  truncated: boolean;
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ExtractionError(
      `下载文件失败: ${res.status} ${res.statusText}`,
      'FETCH_FAILED'
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    // @ts-expect-error pdf-parse 缺少 TS 类型
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (e: any) {
    throw new ExtractionError(`PDF 解析失败: ${e?.message || 'unknown'}`, 'PARSE_FAILED');
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (e: any) {
    throw new ExtractionError(`DOCX 解析失败: ${e?.message || 'unknown'}`, 'PARSE_FAILED');
  }
}

async function extractTxt(buffer: Buffer): Promise<string> {
  // 尝试 utf-8；若失败回退 latin1（不抛错）
  try {
    return buffer.toString('utf-8');
  } catch {
    return buffer.toString('latin1');
  }
}

function truncate(text: string): { text: string; truncated: boolean; chars: number } {
  if (text.length <= MAX_EXTRACTED_CHARS) {
    return { text, truncated: false, chars: text.length };
  }
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true, chars: MAX_EXTRACTED_CHARS };
}

async function parseByMime(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return await extractPdf(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return await extractDocx(buffer);
    case 'text/plain':
    case 'text/markdown':
      return await extractTxt(buffer);
    default:
      throw new ExtractionError(`不支持的文档类型: ${mimeType}`, 'PARSE_FAILED');
  }
}

function cleanAndValidate(raw: string): string {
  const cleaned = raw.replace(/\0/g, '').trim();
  if (!cleaned) {
    throw new ExtractionError('文档内容为空', 'EMPTY');
  }
  return cleaned;
}

export async function extractText(
  fileUrl: string,
  mimeType: string
): Promise<ExtractionResult> {
  const buffer = await fetchAsBuffer(fileUrl);
  const raw = await parseByMime(buffer, mimeType);
  return truncate(cleanAndValidate(raw));
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  const raw = await parseByMime(buffer, mimeType);
  return truncate(cleanAndValidate(raw));
}
