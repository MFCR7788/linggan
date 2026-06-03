// 数字分身训练 API
// POST { videoUrl, name, lookalike? }  → 提交分身训练
// GET  ?avatarId=xxx                   → 查训练状态
//
// 价格说明:HeyGen 训练本身免费,按生成视频秒数计费(约 $0.05-0.067/秒)

import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { trainAvatar, getAvatarTrainingStatus } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user: _user }) => {
  try {
    const { videoUrl, name, lookalike = true } = await request.json();

    if (!videoUrl || !name) {
      return createApiError('缺少必填参数(videoUrl / name)', 400);
    }

    if (!/^https?:\/\//.test(videoUrl)) {
      return createApiError('videoUrl 需为完整 HTTP(S) URL', 400);
    }

    const result = await trainAvatar({
      videoUrl,
      name: name.slice(0, 30),
      lookalike: Boolean(lookalike),
    });

    if (!result.ok) {
      return createApiError(result.error || '训练提交失败', 500);
    }

    return createApiResponse({
      avatarId: result.avatarId,
      status: result.status,
    }, '分身训练已提交,通常 5-15 分钟');
  } catch (e: any) {
    console.error('[Avatar] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
});

export const GET = withAuth(async ({ request, user: _user }) => {
  const { searchParams } = new URL(request.url);
  const avatarId = searchParams.get('avatarId');
  if (!avatarId) return createApiError('缺少 avatarId', 400);

  const result = await getAvatarTrainingStatus(avatarId);
  return createApiResponse(result, '状态已获取');
});
