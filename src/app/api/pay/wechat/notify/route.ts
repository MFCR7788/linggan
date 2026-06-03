// 微信支付 V3 回调处理
// POST /api/pay/wechat/notify
//
// 流程:
// 1. 验证签名(用平台公钥)
// 2. 解密 resource 拿到 transaction 详情
// 3. 幂等更新 payments.status = paid + 给用户充值/订阅
// 4. 返回 ACK 给微信
//
// 微信会重试 3-5 次,所有处理必须幂等

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { verifyNotifySignature, aesGcmDecrypt } from '@/lib/wechat-pay';
import { grant } from '@/lib/credits';

export const dynamic = 'force-dynamic';

interface DecryptedNotify {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR';
  trade_state_desc: string;
  bank_type?: string;
  attach?: string;
  success_time: string;
  payer: { openid: string };
  amount: { total: number; payer_total: number; currency: string; payer_currency: string };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // 1) 验证签名
    const timestamp = request.headers.get('wechatpay-timestamp') || '';
    const nonce = request.headers.get('wechatpay-nonce') || '';
    const signature = request.headers.get('wechatpay-signature') || '';
    const serial = request.headers.get('wechatpay-serial') || '';

    if (!timestamp || !nonce || !signature || !serial) {
      console.error('[Pay/notify] 缺少必要头部');
      return NextResponse.json({ code: 'FAIL', message: '缺少签名头' }, { status: 400 });
    }

    let signValid = false;
    try {
      signValid = await verifyNotifySignature(timestamp, nonce, body, signature, serial);
    } catch (e: any) {
      console.error('[Pay/notify] 验签异常:', e);
      // 验签异常,微信会重试 -- 返 500 触发重试
      return NextResponse.json({ code: 'FAIL', message: '验签异常' }, { status: 500 });
    }
    if (!signValid) {
      console.error('[Pay/notify] 签名无效');
      return NextResponse.json({ code: 'FAIL', message: '签名无效' }, { status: 401 });
    }

    // 2) 解密 resource
    const payload = JSON.parse(body);
    if (payload.event_type !== 'TRANSACTION.SUCCESS') {
      // 其它事件先 ACK,后续按需扩展(如 REFUND.SUCCESS)
      return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
    }

    const resource = payload.resource;
    if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') {
      return NextResponse.json({ code: 'FAIL', message: '不支持的加密算法' }, { status: 400 });
    }

    const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
    if (!apiV3Key) {
      console.error('[Pay/notify] API V3 Key 未配置');
      return NextResponse.json({ code: 'FAIL', message: '服务未配置' }, { status: 500 });
    }

    let decrypted: DecryptedNotify;
    try {
      const plaintext = aesGcmDecrypt(resource.ciphertext, resource.nonce, resource.associated_data, apiV3Key);
      decrypted = JSON.parse(plaintext);
    } catch (e: any) {
      console.error('[Pay/notify] 解密失败:', e);
      return NextResponse.json({ code: 'FAIL', message: '解密失败' }, { status: 400 });
    }

    // 3) 仅处理 SUCCESS 状态
    if (decrypted.trade_state !== 'SUCCESS') {
      console.log('[Pay/notify] 非 SUCCESS 状态:', decrypted.trade_state, decrypted.out_trade_no);
      return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
    }

    // 4) 幂等处理:查 payment
    const supabase = createAdminClient();
    const { data: payment, error: queryErr } = await supabase
      .from('payments')
      .select('*')
      .eq('out_trade_no', decrypted.out_trade_no)
      .maybeSingle();

    if (queryErr || !payment) {
      console.error('[Pay/notify] 订单未找到:', decrypted.out_trade_no);
      // 订单不在我们这里,直接 ACK(避免微信无限重试)
      return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
    }

    if (payment.status === 'paid') {
      // 已处理过,直接 ACK
      return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
    }

    // 金额校验(防篡改)
    if (decrypted.amount.total !== payment.amount_cents) {
      console.error('[Pay/notify] 金额不匹配:', { expected: payment.amount_cents, got: decrypted.amount.total });
      return NextResponse.json({ code: 'FAIL', message: '金额不匹配' }, { status: 400 });
    }

    // 5) 标记 paid + 入账
    const { error: updErr } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        transaction_id: decrypted.transaction_id,
        paid_at: decrypted.success_time,
        callback_payload: decrypted as any,
      })
      .eq('out_trade_no', decrypted.out_trade_no)
      .eq('status', 'pending');  // CAS:只 pending → paid,防并发

    if (updErr) {
      console.error('[Pay/notify] 更新 payment 失败:', updErr);
      return NextResponse.json({ code: 'FAIL', message: '订单更新失败' }, { status: 500 });
    }

    // 6) 按类型入账
    try {
      if (payment.type === 'package') {
        // 加油包:加 credits + bonus
        const totalGrant = (payment.credits_to_grant || 0) + (payment.bonus_credits || 0);
        await grant(
          payment.user_id,
          totalGrant,
          'package_purchase',
          'wechat',
          `购买加油包 ${payment.package_id}`,
          {
            outTradeNo: payment.out_trade_no,
            transactionId: decrypted.transaction_id,
            packageId: payment.package_id,
            mainCredits: payment.credits_to_grant,
            bonusCredits: payment.bonus_credits,
            amountCny: payment.amount_cny,
          }
        );
      } else if (payment.type === 'subscription') {
        // 订阅:取消旧 active + 建新订阅 + 更新 user_credits.tier + 赠首月 credits
        const now = new Date();
        const subExpiresAt = new Date(now);
        subExpiresAt.setDate(subExpiresAt.getDate() + 30);

        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled', cancelled_at: now.toISOString(), auto_renew: false })
          .eq('user_id', payment.user_id)
          .eq('status', 'active');

        const { data: sub } = await supabase
          .from('subscriptions')
          .insert({
            user_id: payment.user_id,
            tier: payment.subscription_tier,
            status: 'active',
            monthly_credits: payment.credits_to_grant,
            started_at: now.toISOString(),
            expires_at: subExpiresAt.toISOString(),
            auto_renew: true,
            payment_method: 'wechat_h5',
            external_subscription_id: decrypted.transaction_id,
          })
          .select('id')
          .single();

        await supabase
          .from('user_credits')
          .update({
            tier: payment.subscription_tier,
            tier_started_at: now.toISOString(),
            tier_expires_at: subExpiresAt.toISOString(),
            last_reset_at: now.toISOString(),
          })
          .eq('user_id', payment.user_id);

        await grant(
          payment.user_id,
          payment.credits_to_grant,
          'subscription_grant',
          'wechat',
          `订阅 ${payment.subscription_tier} 首月赠送`,
          {
            outTradeNo: payment.out_trade_no,
            transactionId: decrypted.transaction_id,
            subscriptionId: sub?.id,
            tier: payment.subscription_tier,
            month: now.toISOString().slice(0, 7),
            amountCny: payment.amount_cny,
          }
        );
      }
    } catch (e: any) {
      // 入账失败,但订单已标 paid。返回 500 让微信重试,我们处理时会因 hasRefunded/已处理跳过
      console.error('[Pay/notify] 入账失败:', e);
      // 注意:这里不回滚 paid 状态,因为支付确实成功了,只是我们入账失败,需人工补单
      // 标记 metadata 待补
      await supabase
        .from('payments')
        .update({ metadata: { ...((payment as any).metadata || {}), grantError: String(e?.message) } })
        .eq('out_trade_no', decrypted.out_trade_no);
      return NextResponse.json({ code: 'FAIL', message: '入账失败,稍后重试' }, { status: 500 });
    }

    console.log('[Pay/notify] 入账成功:', payment.out_trade_no, payment.type, payment.credits_to_grant);
    return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
  } catch (e: any) {
    console.error('[Pay/notify] 未捕获异常:', e);
    return NextResponse.json({ code: 'FAIL', message: String(e?.message) }, { status: 500 });
  }
}
