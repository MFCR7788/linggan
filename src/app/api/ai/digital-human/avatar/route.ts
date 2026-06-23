// 数字分身训练 API
// POST { videoUrl, name, lookalike? }  → 提交分身训练
// GET  ?avatarId=xxx                   → 查训练状态
//
// 价格说明:HeyGen 训练本身免费,按生成视频秒数计费(约 $0.05-0.067/秒)

import { NextResponse } from 'next/server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { trainAvatar, getAvatarTrainingStatus } from '@/lib/ai-services';
import { consume, refund, InsufficientCreditsError, getBalance } from '@/lib/credits';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { checkMonthlyLimit } from '@/lib/tier-limits';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { videoUrl, name, lookalike = true } = await request.json();

    if (!videoUrl || !name) {
      return createApiError('缺少必填参数(videoUrl / name)', 400);
    }

    if (!/^https?:\/\//.test(videoUrl)) {
      return createApiError('videoUrl 需为完整 HTTP(S) URL', 400);
    }

    const creditCost = CREDIT_COSTS.digital_twin.oneTime;

    // 月度次数限制
    const { tier } = await getBalance(user.id);
    const monthCheck = await checkMonthlyLimit(user.id, tier, 'digitalAvatar');
    if (!monthCheck.allowed) {
      return createApiError(monthCheck.message!, 403);
    }

    try {
      await consume(user.id, creditCost, 'ai_digital_twin', '数字分身训练', { name });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { success: false, error: `余额不足:需要 ${creditCost} 灵力，当前 ${e.available} 灵力`, code: 'INSUFFICIENT_CREDITS', data: { required: creditCost, available: e.available } },
          { status: 402 }
        );
      }
      throw e;
    }

    const result = await trainAvatar({
      videoUrl,
      name: name.slice(0, 30),
      lookalike: Boolean(lookalike),
    });

    if (!result.ok) {
      await refund(user.id, creditCost, 'ai_digital_twin', '分身训练提交失败退点', { error: result.error }).catch(() => {});
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
