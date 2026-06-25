// 多媒体上传 API 端点（图片/视频/音频）
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import {
  MEDIA_ALLOWED_TYPES,
  DOCUMENT_ALLOWED_TYPES,
  checkMediaSize,
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
    console.error('解析上传表单失败:', e);
    return createApiError('上传内容过大或格式错误，请尝试压缩图片后重试', 413);
  }

  const file = formData.get('file') as File;
  if (!file) {
    return createApiError('请选择文件', 400);
  }

  const isDocument = DOCUMENT_ALLOWED_TYPES.includes(file.type as any);
  if (!MEDIA_ALLOWED_TYPES.includes(file.type as any) && !isDocument) {
    return createApiError('不支持的文件类型', 415);
  }

  if (isDocument) {
    const sizeCheck = checkDocumentSize(file);
    if (!sizeCheck.ok) {
      return createApiError(`FILE_TOO_LARGE（${sizeCheck.maxMB}MB）`, 413);
    }
  } else {
    const sizeCheck = checkMediaSize(file, file.type.startsWith('video') ? 'video' : 'image');
    if (!sizeCheck.ok) {
      return createApiError(`FILE_TOO_LARGE（${sizeCheck.maxMB}MB）`, 413);
    }
  }

  // Magic number 校验：防止 MIME 伪造
  const magicOk = await verifyMagicNumber(file, file.type);
  if (!magicOk) {
    return createApiError('文件内容与扩展名不匹配', 415);
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
    const fileExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const fileName = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
    const filePath = `uploads/${fileName}`;
    const safeName = sanitizeFilename(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const extToMime: Record<string, string> = {
      pdf: 'application/pdf', docx: 'application/zip',
      md: 'text/markdown', txt: 'text/plain',
    };
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const contentType = extToMime[ext] || file.type;

    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(filePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('文件上传失败:', uploadError);
      return createApiError('文件存储失败，请重试', 502);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(filePath);

    // 累加用量（失败不阻塞主流程）
    addStorageUsage(user.id, file.size).catch((e) =>
      console.error('[upload] 累加用量失败:', e)
    );

    return createApiResponse({
      url: publicUrl,
      fileName: safeName,
      size: file.size,
      type: file.type,
    }, '文件上传成功');
  } catch (dbError) {
    console.error('上传过程出错:', dbError);
    return createApiError('上传失败', 500);
  }
});
