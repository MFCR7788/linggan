// 用户 Credit 余额 + 流水查询 API
// GET /api/credits           → { balance, tier, transactions: [...] }
// GET /api/credits?t=20      → 自定义流水条数
// GET /api/credits?packages=1 → 加油包目录(给前端展示用)
// GET /api/credits?tiers=1   → 订阅档位(给前端展示用)

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { getBalance, getTransactions, getPackages, getTiers } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return createUnauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const txLimit = Math.min(parseInt(searchParams.get('t') || '50'), 200);
  const wantPackages = searchParams.get('packages') === '1';
  const wantTiers = searchParams.get('tiers') === '1';

  try {
    const [balance, transactions, packages, tiers] = await Promise.all([
      getBalance(user.id),
      getTransactions(user.id, txLimit),
      wantPackages ? getPackages() : Promise.resolve(null),
      wantTiers ? getTiers() : Promise.resolve(null),
    ]);

    return createApiResponse({
      balance: balance.balance,
      tier: balance.tier,
      lifetimeConsumed: balance.lifetimeConsumed,
      lifetimePurchased: balance.lifetimePurchased,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.type,
        balanceAfter: tx.balance_after,
        source: tx.source,
        description: tx.description,
        metadata: tx.metadata,
        createdAt: tx.created_at,
      })),
      ...(packages && { packages }),
      ...(tiers && { tiers }),
    }, '余额已获取');
  } catch (e: any) {
    console.error('[Credits] GET error:', e);
    return createApiError(e?.message || '查询失败', 500);
  }
}
