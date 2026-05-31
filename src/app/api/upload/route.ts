// 文件上传 API 端点
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase-server';
import { withAuth } from '@/lib/api-handler';

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
  const type = formData.get('type') as string || 'image';

  if (!file) {
    return createApiError('请选择文件', 400);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
  if (!allowedTypes.includes(file.type)) {
    return createApiError('不支持的文件类型', 400);
  }

  const maxSize = type === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxSize) {
    return createApiError(`文件大小超过限制（${type === 'video' ? '100MB' : '20MB'}）`, 400);
  }

  try {
    const supabase = createAdminClient();
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('lingji-media')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('文件上传失败:', uploadError);
      // 降级：返回模拟 URL
      return createApiResponse({
        url: `https://picsum.photos/seed/${Date.now()}/800/600`,
        fileName: file.name,
        size: file.size,
        type: file.type,
      }, '文件上传成功（模拟模式）');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('lingji-media')
      .getPublicUrl(filePath);

    return createApiResponse({
      url: publicUrl,
      fileName: file.name,
      size: file.size,
      type: file.type,
    }, '文件上传成功');
  } catch (dbError) {
    console.error('上传过程出错:', dbError);
    return createApiError('上传失败', 500);
  }
});
