// 加油包购买(模拟支付,V2.0.3 试运行)
// POST /api/credits/purchase
// body: { packageId: string }
// 真实支付待 V2.0.4 接入(微信/支付宝/微信 H5)

import { createAdminClient } from '@/lib/supabase-server';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { withAuth } from '@/lib/api-handler';
import { grant } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ request, user }) => {
  try {
    const { packageId } = await request.json();
    if (!packageId || typeof packageId !== 'string') {
      return createApiError('packageId 必填', 400);
    }

    // 查加油包(只查 is_active)
    const supabase = createAdminClient();
    const { data: pkg, error: pkgErr } = await supabase
      .from('credit_packages')
      .select('id, name, credits, bonus_credits, price_cny, is_active, validity_days')
      .eq('id', packageId)
      .eq('is_active', true)
      .single();

    if (pkgErr || !pkg) {
      return createApiError('加油包不存在或已下架', 404);
    }

    const totalGranted = pkg.credits + pkg.bonus_credits;

    // ── 模拟支付(V2.0.3 试运行) ──────────────────
    // TODO V2.0.4: 接入微信/支付宝,这里要走预创建订单 → 支付回调 → 再 grant
    // 当前为单步直接到账,仅供试运行,生产环境绝对不能用
    // ──────────────────────────────────────────────

    const result = await grant(
      user.id,
      totalGranted,
      'package_purchase',
      'admin',  // 模拟支付渠道统一记 admin
      `购买加油包 ${pkg.name}`,
      {
        packageId: pkg.id,
        packageName: pkg.name,
        mainCredits: pkg.credits,
        bonusCredits: pkg.bonus_credits,
        priceCny: pkg.price_cny,
        validityDays: pkg.validity_days,
        paymentMethod: 'mock_v203',
      }
    );

    return createApiResponse({
      granted: totalGranted,
      balanceAfter: result.balanceAfter,
      package: {
        id: pkg.id,
        name: pkg.name,
      },
    }, `购买成功 +${totalGranted} credits`);
  } catch (e: any) {
    console.error('[Credits] purchase error:', e);
    return createApiError(e?.message || '购买失败', 500);
  }
});
