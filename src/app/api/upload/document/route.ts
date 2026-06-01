// 文档上传 API 端点（PDF/DOCX/TXT/MD）
// 文档上传后立即创建一条 type='text' 的灵感记录，并触发异步文本抽取+AI 总结
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import {
  DOCUMENT_ALLOWED_TYPES,
  checkDocumentSize,
  verifyMagicNumber,
  sanitizeFilename,
} from '@/lib/upload/validate';
import { checkQuota } from '@/lib/upload/quota';
import { getUsage, addStorageUsage } from '@/lib/upload/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withAuth(async ({ request, user }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error('[upload/document] 解析表单失败:', e);
    return createApiError('上传内容过大或格式错误', 413);
  }

  const file = formData.get('file') as File;
  if (!file) {
    return createApiError('请选择文件', 400);
  }

  if (!DOCUMENT_ALLOWED_TYPES.includes(file.type as any)) {
    return createApiError('UNSUPPORTED_FILE_TYPE', 415);
  }

  const sizeCheck = checkDocumentSize(file);
  if (!sizeCheck.ok) {
    return createApiError(`FILE_TOO_LARGE（${sizeCheck.maxMB}MB）`, 413);
  }

  // Magic number：TXT/MD 跳过（无法可靠校验）
  if (file.type !== 'text/plain' && file.type !== 'text/markdown') {
    const magicOk = await verifyMagicNumber(file, file.type);
    if (!magicOk) {
      return createApiError('FILE_CONTENT_MISMATCH', 415);
    }
  }

  // 配额检查
  const usage = await getUsage(user.id);
  const quota = checkQuota({
    plan: usage.plan,
    storageUsedMB: usage.storageUsedMB,
    monthlyUploads: usage.monthlyUploads,
    additionalBytes: file.size,
  });
  if (!quota.ok) {
    return createApiError(quota.message || quota.reason || 'QUOTA_EXCEEDED', 429);
  }

  try {
    const supabase = createAdminClient();
    const fileExt = file.name.split('.').pop() || 'bin';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `documents/${fileName}`;
    const safeName = sanitizeFilename(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload/document] storage 上传失败:', uploadError);
      return createApiError('STORAGE_UPLOAD_FAILED', 502);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(filePath);

    // 入库：type='text'，原文件作为附件，extraction_status='pending'
    const { data: item, error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: user.id,
        type: 'text',
        title: safeName,
        original_file_url: publicUrl,
        original_filename: safeName,
        original_file_size: file.size,
        original_mime_type: file.type,
        extraction_status: 'pending',
        analysis_status: 'pending',
        source_platform: 'upload',
        status: 'active',
      })
      .select()
      .single();

    if (insertError || !item) {
      console.error('[upload/document] 入库失败:', insertError);
      // 清理已上传的 storage 对象，避免孤儿
      await supabase.storage.from('lingji-media').remove([filePath]).catch(() => {});
      return createApiError('创建灵感记录失败', 500);
    }

    // 累加用量
    addStorageUsage(user.id, file.size).catch((e) =>
      console.error('[upload/document] 累加用量失败:', e)
    );

    return createApiResponse(
      {
        id: item.id,
        url: publicUrl,
        fileName: safeName,
        size: file.size,
        type: file.type,
        extractionStatus: 'pending',
      },
      '文档上传成功'
    );
  } catch (e) {
    console.error('[upload/document] 上传过程出错:', e);
    return createApiError('上传失败', 500);
  }
});
