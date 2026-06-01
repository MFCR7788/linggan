// 文档抽取 + AI 总结触发端点
// 上传文档成功后由前端 fire-and-forget 调用
// 流程：pending → extracting → extracted（成功）/ failed（失败）
// 用户在详情页可手动重试（允许 failed → extracting）

import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import { extractText, ExtractionError } from '@/lib/extract/document-extractor';
import { summarizeContent } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RETRYABLE_STATUSES = new Set(['pending', 'failed']);

export const POST = withAuth(async ({ user, params }) => {
  const { id } = params;
  const supabase = createAdminClient();

  // 1. 取记录
  const { data: item, error: fetchError } = await supabase
    .from('content_items')
    .select('id, user_id, original_file_url, original_mime_type, extraction_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !item) {
    return createApiError('灵感不存在', 404);
  }

  if (!item.original_file_url || !item.original_mime_type) {
    return createApiError('该灵感没有原始文件，无需抽取', 400);
  }

  if (item.extraction_status && !RETRYABLE_STATUSES.has(item.extraction_status)) {
    return createApiError(`当前状态(${item.extraction_status})不允许重试`, 409);
  }

  // 2. 标记为 extracting
  await supabase
    .from('content_items')
    .update({
      extraction_status: 'extracting',
      extraction_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  // 3. 抽文本
  let text: string;
  let chars: number;
  let truncated: boolean;
  try {
    const result = await extractText(item.original_file_url, item.original_mime_type);
    text = result.text;
    chars = result.chars;
    truncated = result.truncated;
  } catch (e) {
    const code = e instanceof ExtractionError ? e.code : 'PARSE_FAILED';
    const message = e instanceof Error ? e.message : '抽取失败';
    await supabase
      .from('content_items')
      .update({
        extraction_status: 'failed',
        extraction_error: `${code}: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);
    return createApiError(`EXTRACTION_FAILED: ${message}`, 422);
  }

  // 4. AI 总结
  let summary: {
    title: string;
    summary: string;
    keyPoints: string[];
    tags: string[];
  };

  try {
    const result = await summarizeContent(
      truncated ? `${text}\n\n[文档内容已截断，原文超过 ${chars} 字]` : text,
      '文档'
    );
    summary = {
      title: result.title,
      summary: result.summary,
      keyPoints: result.keyPoints,
      tags: result.tags,
    };
  } catch (e) {
    console.error('[extract] AI 总结失败:', e);
    // 抽取成功但 AI 失败：extraction_status='extracted'，analysis_status='failed'
    await supabase
      .from('content_items')
      .update({
        extraction_status: 'extracted',
        extracted_chars: chars,
        original_text: text.slice(0, 5000), // 存前 5000 字供搜索
        analysis_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);
    return createApiError('AI_SUMMARY_FAILED', 500);
  }

  // 5. 写回
  const { data: updated, error: updateError } = await supabase
    .from('content_items')
    .update({
      extraction_status: 'extracted',
      extracted_chars: chars,
      original_text: text.slice(0, 5000),
      ai_summary: summary.summary,
      ai_key_points: summary.keyPoints,
      // 标题若还没设置，用 AI 生成的
      title: summary.title || undefined,
      analysis_status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateError) {
    console.error('[extract] 写回失败:', updateError);
    return createApiError('写回失败', 500);
  }

  return createApiResponse(updated, '文档抽取与 AI 总结完成');
});
