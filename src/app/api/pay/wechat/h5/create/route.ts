// 创建微信支付 H5 订单
// POST /api/pay/wechat/h5/create { type: 'package' | 'subscription', id: string }
// → { h5Url, outTradeNo, expiresAt }
//
// 浏览器外打开:用户跳转 h5Url → 微信 App 拉起 → 支付 → 微信回调 /notify

import { NextRequest } from 'next/server';
import { getCurrentUser, createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError, createUnauthorizedResponse } from '@/lib/api-utils';
import { createH5Order, genOutTradeNo } from '@/lib/wechat-pay';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { type, id } = await request.json();
    if (type !== 'package' && type !== 'subscription') {
      return createApiError('type 必须是 package 或 subscription', 400);
    }
    if (!id || typeof id !== 'string') {
      return createApiError('缺少 id', 400);
    }

    const supabase = createAdminClient();

    // 1) 查目标商品(加油包 OR 订阅档位)
    let amountCny: number;
    let creditsToGrant: number;
    let bonusCredits = 0;
    let description: string;

    if (type === 'package') {
      const { data: pkg, error: pkgErr } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();
      if (pkgErr || !pkg) return createApiError('加油包不存在或已下架', 404);
      amountCny = Number(pkg.price_cny);
      creditsToGrant = pkg.credits;
      bonusCredits = pkg.bonus_credits || 0;
      description = `灵集 ${pkg.name} · ${pkg.credits}${bonusCredits > 0 ? `+${bonusCredits}` : ''} credits`;
    } else {
      const { data: tier, error: tierErr } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('tier', id)
        .eq('is_active', true)
        .single();
      if (tierErr || !tier) return createApiError('订阅档位不存在', 404);
      if (tier.tier === 'free') return createApiError('免费版无需支付', 400);
      amountCny = Number(tier.monthly_price_cny);
      creditsToGrant = tier.monthly_credits;
      description = `灵集 ${tier.name} 订阅 · ${tier.monthly_credits} credits/月`;
    }

    if (amountCny <= 0) return createApiError('金额异常', 400);
    const amountCents = Math.round(amountCny * 100);

    // 2) 生成商户单号 + 入库 pending 订单
    const outTradeNo = genOutTradeNo();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);  // 30 分钟超时

    const { data: payment, error: insertErr } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        out_trade_no: outTradeNo,
        type,
        package_id: type === 'package' ? id : null,
        subscription_tier: type === 'subscription' ? id : null,
        amount_cny: amountCny,
        amount_cents: amountCents,
        credits_to_grant: creditsToGrant,
        bonus_credits: bonusCredits,
        status: 'pending',
        payment_method: 'wechat_h5',
        expires_at: expiresAt.toISOString(),
        metadata: { description },
      })
      .select('id')
      .single();

    if (insertErr || !payment) {
      console.error('[Pay/H5] 订单入库失败:', insertErr);
      return createApiError('订单创建失败', 500);
    }

    // 3) 调微信 V3 H5 下单
    let h5Url: string;
    try {
      const clientIp = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '127.0.0.1';
      const res = await createH5Order({
        outTradeNo,
        description,
        amountCents,
        attach: `${user.id}:${type}:${id}`,
        clientIp,
        sceneInfo: {
          type: 'Wap',
          wapName: '灵集 LingJi',
        },
      });
      h5Url = res.h5_url;
    } catch (e: any) {
      // 调用失败,标记订单 failed
      await supabase
        .from('payments')
        .update({ status: 'failed', metadata: { ...((payment as any).metadata || {}), wechatError: String(e?.message) } })
        .eq('out_trade_no', outTradeNo);
      console.error('[Pay/H5] WeChat 下单失败:', e);
      return createApiError(`微信下单失败:${e?.message || '未知错误'}`, 500);
    }

    // 4) 保存 h5_url
    await supabase.from('payments').update({ h5_url: h5Url }).eq('out_trade_no', outTradeNo);

    return createApiResponse({
      outTradeNo,
      h5Url,
      amountCny,
      creditsToGrant,
      bonusCredits,
      expiresAt: expiresAt.toISOString(),
    }, '订单创建成功,请在微信中完成支付');
  } catch (e: any) {
    console.error('[Pay/H5 create] error:', e);
    return createApiError(e?.message || '创建订单失败', 500);
  }
}
