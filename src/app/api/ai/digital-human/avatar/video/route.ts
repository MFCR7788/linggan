// 用数字分身生成口播视频 API
// POST { avatarId, script, voiceId?, backgroundColor? }  → 提交生成
// GET  ?videoId=xxx                                       → 查状态

import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { generateAvatarVideo, getAvatarVideoStatus } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user: _user }) => {
  try {
    const { avatarId, script, voiceId, backgroundColor } = await request.json();

    if (!avatarId || !script) {
      return createApiError('缺少必填参数(avatarId / script)', 400);
    }

    if (script.length > 5000) {
      return createApiError('口播脚本不能超过 5000 字', 400);
    }

    const result = await generateAvatarVideo({
      avatarId,
      script: script.slice(0, 5000),
      voiceId,
      backgroundColor,
    });

    if (!result.ok) {
      return createApiError(result.error || '生成失败', 500);
    }

    return createApiResponse({
      videoId: result.videoId,
    }, '分身视频已提交,通常 1-3 分钟');
  } catch (e: any) {
    console.error('[Avatar Video] POST error:', e);
    return createApiError(e?.message || '服务器错误', 500);
  }
});

export const GET = withAuth(async ({ request, user: _user }) => {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  if (!videoId) return createApiError('缺少 videoId', 400);

  const result = await getAvatarVideoStatus(videoId);
  return createApiResponse(result, '状态已获取');
});
