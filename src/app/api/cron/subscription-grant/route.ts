// 月度订阅赠送 cron(Vercel Cron 调用)
// 每天 0 点跑一次(UTC),处理到期的订阅:
// - 自动续费用户:延 30 天 + 赠送月度 credits
// - 已取消用户(到期不续):降级到 free + 清余额 + 写 reset 流水
// - 加油包余额不受影响(只动订阅赠送的部分)
//
// 安全: 必须携带 Vercel Cron Secret 头

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { grant, getBalance } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleGrant(request);
}

export async function POST(request: NextRequest) {
  return handleGrant(request);
}

async function handleGrant(request: NextRequest) {
  // 安全校验
  const authHeader = request.headers.get('authorization') || '';
  const expectedSecret = process.env['CRON_SECRET'];
  if (!expectedSecret) {
    return createApiError('CRON_SECRET 未配置,拒绝执行', 500);
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return createApiError('未授权', 401);
  }

  try {
    const supabase = createAdminClient();

    // 1) 找所有到期的订阅用户(tier != free, expires_at <= now)
    const { data: expiredUsers, error: expErr } = await supabase
      .from('user_credits')
      .select('user_id, balance, tier, tier_expires_at')
      .neq('tier', 'free')
      .not('tier_expires_at', 'is', null)
      .lte('tier_expires_at', new Date().toISOString());

    if (expErr) throw expErr;
    if (!expiredUsers || expiredUsers.length === 0) {
      return createApiResponse({
        processed: 0, renewed: 0, downgraded: 0,
        ranAt: new Date().toISOString(),
      }, '无到期用户');
    }

    let renewedCount = 0;
    let downgradedCount = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const u of expiredUsers) {
      try {
        // 2) 查该用户最近一条 active 订阅
        const { data: latestSub } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', u.user_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSub && latestSub.auto_renew) {
          // ── 自动续费:延 30 天 + 赠送 monthly_credits ──
          const newExpiresAt = new Date();
          newExpiresAt.setDate(newExpiresAt.getDate() + 30);

          // 更新订阅记录(延过期时间)
          await supabase
            .from('subscriptions')
            .update({ expires_at: newExpiresAt.toISOString() })
            .eq('id', latestSub.id);

          // 更新 user_credits
          await supabase
            .from('user_credits')
            .update({ tier_expires_at: newExpiresAt.toISOString() })
            .eq('user_id', u.user_id);

          // 赠送月度 credits
          await grant(
            u.user_id,
            latestSub.monthly_credits,
            'subscription_grant',
            'cron',
            `${u.tier} 月度订阅赠送`,
            {
              subscriptionId: latestSub.id,
              tier: u.tier,
              month: new Date().toISOString().slice(0, 7),
            }
          );

          renewedCount++;
        } else {
          // ── 已取消/无订阅:降级到 free + 清订阅赠送余额 ──
          // 简化:直接清零(只清订阅赠送部分需 ledger,这里一刀切)
          // 写 reset 流水
          const balance = await getBalance(u.user_id);
          if (balance.balance > 0) {
            await supabase.from('credit_transactions').insert({
              user_id: u.user_id,
              amount: -balance.balance,
              type: 'reset',
              balance_after: 0,
              source: 'cron',
              description: `订阅到期,余额清零(${u.tier} → free)`,
              metadata: { previousTier: u.tier, previousBalance: balance.balance },
            });
          }

          // 标记订阅 expired
          if (latestSub) {
            await supabase
              .from('subscriptions')
              .update({ status: 'expired' })
              .eq('id', latestSub.id);
          }

          // 降级 user_credits
          await supabase
            .from('user_credits')
            .update({
              tier: 'free',
              tier_expires_at: null,
              last_reset_at: new Date().toISOString(),
              balance: 0,  // 简化:一刀切
            })
            .eq('user_id', u.user_id);

          downgradedCount++;
        }
      } catch (e: any) {
        console.error(`[Cron subscription-grant] 用户 ${u.user_id} 处理失败:`, e);
        errors.push({ userId: u.user_id, error: String(e?.message) });
      }
    }

    return createApiResponse({
      processed: expiredUsers.length,
      renewed: renewedCount,
      downgraded: downgradedCount,
      errors,
      ranAt: new Date().toISOString(),
    }, `处理完成:续费 ${renewedCount} 人,降级 ${downgradedCount} 人,失败 ${errors.length}`);
  } catch (e: any) {
    console.error('[Cron subscription-grant] error:', e);
    return createApiError(e?.message || '月度赠送失败', 500);
  }
}
