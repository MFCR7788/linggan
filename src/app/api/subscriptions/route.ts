// 订阅管理 API
// GET    /api/subscriptions              → 当前用户的订阅信息
// POST   /api/subscriptions { tier }     → 订阅/升级到指定档位(模拟支付 V2.0.3)
// DELETE /api/subscriptions              → 取消订阅(auto_renew=false,到期不续)

import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { grant } from '@/lib/credits';
import type { CreditTier } from '@/lib/credits';

export const dynamic = 'force-dynamic';

const VALID_TIERS: CreditTier[] = ['free', 'basic', 'pro', 'studio', 'enterprise'];

export const GET = withAuth(async ({ request, user }) => {
  try {
    const supabase = createAdminClient();

    // 查 user_credits 当前档位 + 过期时间
    const { data: credits } = await supabase
      .from('user_credits')
      .select('tier, tier_started_at, tier_expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // 查活跃订阅记录
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // 查档位配置
    const { data: tiers } = await supabase
      .from('subscription_tiers')
      .select('*')
      .order('sort_order', { ascending: true });

    return createApiResponse({
      currentTier: credits?.tier || 'free',
      tierStartedAt: credits?.tier_started_at,
      tierExpiresAt: credits?.tier_expires_at,
      subscriptions: subs || [],
      tiers: (tiers || []).map((t: any) => ({
        ...t,
        features: Array.isArray(t.features) ? t.features : [],
      })),
    });
  } catch (e: any) {
    console.error('[Subscriptions] GET error:', e);
    return createApiError(e?.message || '查询失败', 500);
  }
});

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { tier } = await request.json();
    if (!tier || !VALID_TIERS.includes(tier)) {
      return createApiError(`tier 必须是 ${VALID_TIERS.join('/')} 之一`, 400);
    }

    const supabase = createAdminClient();

    // 查档位配置
    const { data: tierDef, error: tierErr } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('tier', tier)
      .maybeSingle();

    if (tierErr || !tierDef) {
      return createApiError('订阅档位不存在', 404);
    }

    // 模拟支付(V2.0.3 试运行)
    // TODO V2.0.4: 接入微信/支付宝订阅

    // free 档:取消订阅,不创建记录
    if (tier === 'free') {
      // 取消所有 active 订阅
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), auto_renew: false })
        .eq('user_id', user.id)
        .eq('status', 'active');
      // 更新 user_credits.tier → free,tier_expires_at 置空
      await supabase
        .from('user_credits')
        .update({ tier: 'free', tier_expires_at: null })
        .eq('user_id', user.id);
      return createApiResponse({
        tier: 'free', cancelled: true, message: '已切换到免费版',
      }, '已降级到免费版');
    }

    // 付费档:创建订阅记录 + 更新 user_credits.tier + 立即赠送月度 credits
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);  // 30 天

    // 1) 取消旧 active 订阅(若有)
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: now.toISOString(), auto_renew: false })
      .eq('user_id', user.id)
      .eq('status', 'active');

    // 2) 创建新订阅
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        tier,
        status: 'active',
        monthly_credits: tierDef.monthly_credits,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        auto_renew: true,
        payment_method: 'mock_v203',  // 模拟支付
      })
      .select('*')
      .maybeSingle();

    if (subErr || !sub) {
      console.error('[Subscriptions] insert error:', subErr);
      return createApiError('订阅创建失败', 500);
    }

    // 3) 更新 user_credits 当前档位
    await supabase
      .from('user_credits')
      .update({
        tier,
        tier_started_at: now.toISOString(),
        tier_expires_at: expiresAt.toISOString(),
        last_reset_at: now.toISOString(),
      })
      .eq('user_id', user.id);

    // 4) 立即赠送首月 credits
    const grantResult = await grant(
      user.id,
      tierDef.monthly_credits,
      'subscription_grant',
      'admin',
      `订阅 ${tierDef.name} 赠送`,
      {
        subscriptionId: sub.id,
        tier,
        month: now.toISOString().slice(0, 7),  // YYYY-MM
      }
    );

    return createApiResponse({
      tier,
      tierName: tierDef.name,
      monthlyCredits: tierDef.monthly_credits,
      subscriptionId: sub.id,
      expiresAt: expiresAt.toISOString(),
      creditsGranted: tierDef.monthly_credits,
      balanceAfter: grantResult.balanceAfter,
      message: `订阅成功!本月已赠送 ${tierDef.monthly_credits} 灵力，30 天后到期`,
    }, '订阅成功');
  } catch (e: any) {
    console.error('[Subscriptions] POST error:', e);
    return createApiError(e?.message || '订阅失败', 500);
  }
});

export const DELETE = withAuth(async ({ request, user }) => {
  try {
    const supabase = createAdminClient();

    // 取消 active 订阅(不立即降级,等 expires_at 到期)
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        auto_renew: false,
      })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id, tier, expires_at');

    if (error) throw error;
    return createApiResponse({
      cancelled: data || [],
      message: '已取消自动续费,当前订阅将持续到当前周期结束',
    });
  } catch (e: any) {
    console.error('[Subscriptions] DELETE error:', e);
    return createApiError(e?.message || '取消失败', 500);
  }
});
