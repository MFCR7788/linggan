// 查询微信支付订单状态(前端轮询用)
// GET /api/pay/wechat/query?outTradeNo=XXX
// → { status, paidAt, transactionId, balanceAfter? }
//
// 前端在用户从微信跳回后轮询此接口直到 status=paid 或 timeout
// 同时:如果回调晚到,这里会主动调微信查询订单 → 如果实际已 SUCCESS 但我们还是 pending,触发补单逻辑

import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { queryOrderByOutTradeNo } from '@/lib/wechat-pay';
import { grant, getBalance } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ request, user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const outTradeNo = searchParams.get('outTradeNo');
    if (!outTradeNo) return createApiError('缺少 outTradeNo', 400);

    const supabase = createAdminClient();

    // 1) 先查我们的 payment 记录
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .eq('out_trade_no', outTradeNo)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pErr || !payment) return createApiError('订单不存在', 404);

    // 2) 已 paid 直接返
    if (payment.status === 'paid') {
      const balance = await getBalance(user.id);
      return createApiResponse({
        status: 'paid',
        paidAt: payment.paid_at,
        transactionId: payment.transaction_id,
        amountCny: payment.amount_cny,
        creditsGranted: (payment.credits_to_grant || 0) + (payment.bonus_credits || 0),
        balanceAfter: balance.balance,
      });
    }

    // 3) 已 failed/expired/refunded
    if (payment.status !== 'pending') {
      return createApiResponse({
        status: payment.status,
        amountCny: payment.amount_cny,
      });
    }

    // 4) pending 状态:主动调微信查询(避免回调丢失)
    try {
      const wxOrder = await queryOrderByOutTradeNo(outTradeNo);

      if (wxOrder.trade_state === 'SUCCESS') {
        // 微信说成功了,但我们还没 paid → 补单(应对回调丢失/延迟)
        const expectedCents = payment.amount_cents;
        if (wxOrder.amount?.total !== expectedCents) {
          return createApiError('金额不匹配,请联系客服', 500);
        }

        const { error: updErr } = await supabase
          .from('payments')
          .update({
            status: 'paid',
            transaction_id: wxOrder.transaction_id,
            paid_at: wxOrder.success_time || new Date().toISOString(),
            callback_payload: { source: 'query_fallback', wxOrder } as any,
          })
          .eq('out_trade_no', outTradeNo)
          .eq('status', 'pending');

        if (!updErr) {
          // 入账
          if (payment.type === 'package') {
            const totalGrant = (payment.credits_to_grant || 0) + (payment.bonus_credits || 0);
            await grant(payment.user_id, totalGrant, 'package_purchase', 'wechat',
              `购买加油包 ${payment.package_id}(补单)`, {
                outTradeNo, transactionId: wxOrder.transaction_id,
                packageId: payment.package_id, amountCny: payment.amount_cny,
                fallback: true,
              });
          } else if (payment.type === 'subscription') {
            const now = new Date();
            const subExp = new Date(now);
            subExp.setDate(subExp.getDate() + 30);
            await supabase
              .from('subscriptions')
              .update({ status: 'cancelled', cancelled_at: now.toISOString(), auto_renew: false })
              .eq('user_id', payment.user_id).eq('status', 'active');
            const { data: sub } = await supabase
              .from('subscriptions')
              .insert({
                user_id: payment.user_id, tier: payment.subscription_tier, status: 'active',
                monthly_credits: payment.credits_to_grant,
                started_at: now.toISOString(), expires_at: subExp.toISOString(),
                auto_renew: true, payment_method: 'wechat_h5',
                external_subscription_id: wxOrder.transaction_id,
              })
              .select('id').maybeSingle();
            await supabase
              .from('user_credits')
              .update({
                tier: payment.subscription_tier,
                tier_started_at: now.toISOString(),
                tier_expires_at: subExp.toISOString(),
                last_reset_at: now.toISOString(),
              })
              .eq('user_id', payment.user_id);
            await grant(payment.user_id, payment.credits_to_grant, 'subscription_grant', 'wechat',
              `订阅 ${payment.subscription_tier} 首月赠送(补单)`, {
                outTradeNo, transactionId: wxOrder.transaction_id,
                subscriptionId: sub?.id, tier: payment.subscription_tier,
                amountCny: payment.amount_cny, fallback: true,
              });
          }

          const balance = await getBalance(user.id);
          return createApiResponse({
            status: 'paid',
            paidAt: wxOrder.success_time,
            transactionId: wxOrder.transaction_id,
            amountCny: payment.amount_cny,
            creditsGranted: (payment.credits_to_grant || 0) + (payment.bonus_credits || 0),
            balanceAfter: balance.balance,
            fromFallback: true,
          });
        }
      }

      // 还未支付 / 已关闭 / 已撤销
      const stateMap: Record<string, 'pending' | 'expired' | 'failed'> = {
        NOTPAY: 'pending',
        USERPAYING: 'pending',
        CLOSED: 'expired',
        REVOKED: 'expired',
        PAYERROR: 'failed',
      };
      const newStatus = stateMap[wxOrder.trade_state] || 'pending';
      // 微信说已过期/失败的,同步我方状态
      if (newStatus !== 'pending') {
        await supabase.from('payments')
          .update({ status: newStatus })
          .eq('out_trade_no', outTradeNo)
          .eq('status', 'pending');
      }
      return createApiResponse({
        status: newStatus,
        amountCny: payment.amount_cny,
        wechatState: wxOrder.trade_state,
        wechatStateDesc: wxOrder.trade_state_desc,
      });
    } catch (e: any) {
      console.error('[Pay/query] 微信查询失败:', e);
      // 微信查询失败但订单仍 pending,返回 pending 让前端继续轮询
      return createApiResponse({
        status: 'pending',
        amountCny: payment.amount_cny,
        queryError: String(e?.message),
      });
    }
  } catch (e: any) {
    console.error('[Pay/query] error:', e);
    return createApiError(e?.message || '查询失败', 500);
  }
});
