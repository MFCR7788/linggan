import type { ToolDefinition } from '../../types';
import { createAdminClient } from '@/lib/supabase-server';
import { extractTextFromBuffer } from '@/lib/extract/document-extractor';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

export const readDocumentTool: ToolDefinition = {
  name: 'read_document',
  description: '读取上传的文档内容（PDF/DOCX/TXT/Markdown）。当用户上传文档并要求分析、总结、提取内容时使用。',
  parameters: {
    type: 'object',
    properties: {
      documentUrl: { type: 'string', description: '文档在 Supabase Storage 中的 URL' },
    },
    required: ['documentUrl'],
  },
  async handler(params, ctx) {
    const docUrl = params.documentUrl as string;
    try {
      const url = new URL(docUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      const publicIdx = parts.indexOf('public');
      if (publicIdx === -1 || publicIdx + 2 >= parts.length) {
        return { success: false, output: '文档 URL 格式无效。' };
      }
      const bucket = parts[publicIdx + 1];
      const storagePath = parts.slice(publicIdx + 2).join('/');
      if (!storagePath.startsWith(`${ctx.userId}/`)) {
        return { success: false, output: '无权访问此文档。' };
      }

      const ext = storagePath.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_MAP[ext];
      if (!mimeType) {
        return { success: false, output: `不支持的文档格式: ${ext}` };
      }

      const supabase = createAdminClient();
      const { data, error } = await supabase.storage.from(bucket).download(storagePath);
      if (error || !data) {
        return { success: false, output: '下载文档失败。' };
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await extractTextFromBuffer(buffer, mimeType);
      return {
        success: true,
        output: result.text ? result.text.substring(0, 3000) : '文档内容为空。',
        data: { length: result.text?.length || 0 },
      };
    } catch (e) {
      return { success: false, output: '', error: `文档读取失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
