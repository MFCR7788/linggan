// 月底清零 cron(Vercel Cron 调用)
// POST/GET /api/cron/credits-reset
// 配置见 vercel.json → crons 段(每月 1 号 00:00 UTC+8)
//
// 安全:必须携带 Vercel Cron Secret 头,否则任何人手动触发都能重置,会出大事
//
// 业务规则:只清零"订阅档位赠送的余额",加油包余额不动
// 当前实现:简化版一刀切(只对 tier_expires_at <= now 的用户清零,加油包用户没到期时间)

import { NextRequest } from 'next/server';
import { resetMonthlyCredits } from '@/lib/credits';
import { createApiResponse, createApiError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleReset(request);
}

export async function POST(request: NextRequest) {
  return handleReset(request);
}

async function handleReset(request: NextRequest) {
  // 安全校验:Vercel Cron 自动带 Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置,拒绝执行', 500);
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return createApiError('未授权', 401);
  }

  try {
    const result = await resetMonthlyCredits();
    return createApiResponse({
      processed: result.processed,
      totalReset: result.totalReset,
      ranAt: new Date().toISOString(),
    }, `清零完成:处理 ${result.processed} 个用户,共清 ${result.totalReset} credits`);
  } catch (e: any) {
    console.error('[Cron] credits-reset error:', e);
    return createApiError(e?.message || '清零失败', 500);
  }
}
