// 灵感库多媒体上传端点（图片/视频/音频）
// 与 /api/upload/document 对称：上传到 storage 后立即创建一条 ContentItem
// 与 /api/upload（capture 等页面用的"只拿 URL"端点）保持隔离
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';
import {
  MEDIA_ALLOWED_TYPES,
  checkMediaSize,
  verifyMagicNumber,
  sanitizeFilename,
} from '@/lib/upload/validate';
import { checkQuota } from '@/lib/upload/quota';
import { getUsage, addStorageUsage } from '@/lib/upload/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TYPE_MAP: Record<string, 'image' | 'video' | 'audio'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
};

export const POST = withAuth(async ({ request, user }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error('[upload/inspiration] 解析表单失败:', e);
    return createApiError('上传内容过大或格式错误', 413);
  }

  const file = formData.get('file') as File;
  if (!file) {
    return createApiError('请选择文件', 400);
  }

  if (!MEDIA_ALLOWED_TYPES.includes(file.type as any)) {
    return createApiError('不支持的文件类型', 415);
  }

  const sizeCheck = checkMediaSize(file, file.type.startsWith('video') ? 'video' : 'image');
  if (!sizeCheck.ok) {
    return createApiError(`FILE_TOO_LARGE（${sizeCheck.maxMB}MB）`, 413);
  }

  // Magic number
  const magicOk = await verifyMagicNumber(file, file.type);
  if (!magicOk) {
    return createApiError('文件内容与扩展名不匹配', 415);
  }

  // 配额
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
    const filePath = `uploads/${fileName}`;
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
      console.error('[upload/inspiration] storage 上传失败:', uploadError);
      return createApiError('文件存储失败，请重试', 502);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(filePath);

    const contentType = TYPE_MAP[file.type] || 'image';

    // 直接创建 ContentItem
    const { data: item, error: insertError } = await supabase
      .from('content_items')
      .insert({
        user_id: user.id,
        type: contentType,
        title: safeName,
        media_urls: [publicUrl],
        source_platform: 'upload',
        analysis_status: 'pending', // 触发未来可能的 AI 处理
        status: 'active',
      })
      .select()
      .single();

    if (insertError || !item) {
      console.error('[upload/inspiration] 入库失败:', insertError);
      await supabase.storage.from('lingji-media').remove([filePath]).catch(() => {});
      return createApiError('创建灵感记录失败', 500);
    }

    addStorageUsage(user.id, file.size).catch((e) =>
      console.error('[upload/inspiration] 累加用量失败:', e)
    );

    return createApiResponse(
      {
        id: item.id,
        url: publicUrl,
        fileName: safeName,
        size: file.size,
        type: file.type,
        contentType,
      },
      '上传成功'
    );
  } catch (e) {
    console.error('[upload/inspiration] 上传过程出错:', e);
    return createApiError('上传失败', 500);
  }
});
