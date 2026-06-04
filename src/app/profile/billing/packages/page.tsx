'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Loader2, Gift, CheckCircle2, AlertCircle, RefreshCw, ExternalLink,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { useToast } from '@/components/Toast';
import { ProtectedRoute } from '@/components';
import { apiClient } from '@/lib/api-client';

interface Package {
  id: string;
  name: string;
  credits: number;
  bonus_credits: number;
  price_cny: number;
  original_price_cny: number | null;
  validity_days: number;
  badge: string | null;
}

interface OrderInfo {
  outTradeNo: string;
  h5Url: string;
  amountCny: number;
  creditsToGrant: number;
  bonusCredits: number;
  expiresAt: string;
  packageName: string;
}

type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

function PackagesContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Package | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get<{ packages: Package[] }>('/credits?packages=1');
        if (r.success && r.data?.packages) {
          setPackages(r.data.packages);
        }
      } catch {
        setPackages([
          { id: 'starter',    name: '体验包',   credits: 100,  bonus_credits: 20,   price_cny: 29,   original_price_cny: 35,   validity_days: 180, badge: '入门首选' },
          { id: 'standard',   name: '标准包',   credits: 500,  bonus_credits: 150,  price_cny: 119,  original_price_cny: 149,  validity_days: 365, badge: '省 20%' },
          { id: 'large',      name: '大包',     credits: 2000, bonus_credits: 800,  price_cny: 399,  original_price_cny: 499,  validity_days: 365, badge: '省 30%' },
          { id: 'enterprise', name: '企业包',   credits: 10000,bonus_credits: 5000, price_cny: 1599, original_price_cny: 1999, validity_days: 365, badge: '省 45%' },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 卸载时清轮询
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const queryOrderStatus = async (outTradeNo: string) => {
    const r = await apiClient.get<{
      status: OrderStatus;
      balanceAfter?: number;
      creditsGranted?: number;
    }>(`/pay/wechat/query?outTradeNo=${outTradeNo}`);
    if (r.success && r.data) {
      setOrderStatus(r.data.status);
      if (r.data.status === 'paid') {
        setBalanceAfter(r.data.balanceAfter ?? null);
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        showToast(`支付成功!+${r.data.creditsGranted} credits 已到账`, 'success');
      } else if (r.data.status === 'expired' || r.data.status === 'failed') {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    }
  };

  const startPolling = (outTradeNo: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    // 立即查一次,然后每 3s 查一次,最多 5 分钟
    queryOrderStatus(outTradeNo);
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(() => {
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }
      queryOrderStatus(outTradeNo);
    }, 3000);
  };

  const handlePurchase = async (pkg: Package) => {
    setPurchasing(pkg.id);
    try {
      const r = await apiClient.post<{
        outTradeNo: string;
        h5Url: string;
        amountCny: number;
        creditsToGrant: number;
        bonusCredits: number;
        expiresAt: string;
      }>('/pay/wechat/h5/create', { type: 'package', id: pkg.id });

      if (r.success && r.data) {
        const orderInfo: OrderInfo = { ...r.data, packageName: pkg.name };
        setOrder(orderInfo);
        setOrderStatus('pending');
        setConfirming(null);
        // 自动打开微信支付 H5(新窗口,iOS Safari 需要 user gesture 同步触发)
        window.open(r.data.h5Url, '_blank');
        // 开始轮询
        startPolling(r.data.outTradeNo);
      } else {
        showToast(r.error || '下单失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '下单失败', 'error');
    } finally {
      setPurchasing(null);
    }
  };

  const handleManualRefresh = () => {
    if (order) queryOrderStatus(order.outTradeNo);
  };

  const handleReopenH5 = () => {
    if (order) window.open(order.h5Url, '_blank');
  };

  const handleCloseOrder = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setOrder(null);
    setOrderStatus('pending');
    setBalanceAfter(null);
    if (orderStatus === 'paid') {
      router.push('/profile/billing');
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <TopNav
        title="加油包"
        showBack
        onBack={() => router.push('/profile/billing')}
      />

      <div className="flex-1 px-4 pt-4 space-y-3">
        <GlassCard>
          <div className="flex items-center gap-2">
            <Gift size={20} color="#F472B6" />
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>加油包 = 永久有效 credits</p>
              <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                订阅外的额外 credits,一次性购买,长期有效(180-365 天)
              </p>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} color="#9CA3AF" className="animate-spin" />
          </div>
        ) : (
          packages.map((pkg) => {
            const total = pkg.credits + pkg.bonus_credits;
            const pricePerCredit = (pkg.price_cny / total).toFixed(3);
            const isHot = pkg.id === 'standard' || pkg.id === 'large';
            return (
              <GlassCard key={pkg.id} className="relative">
                {pkg.badge && (
                  <div
                    className="absolute -top-2 right-3 px-2.5 py-0.5 rounded-md"
                    style={{
                      background: isHot
                        ? 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)'
                        : 'rgba(103,232,249,0.2)',
                      color: isHot ? '#FFFFFF' : '#67E8F9',
                      fontSize: 10, fontWeight: 700,
                      border: isHot ? 'none' : '1px solid rgba(103,232,249,0.4)',
                    }}
                  >
                    {pkg.badge}
                  </div>
                )}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>{pkg.name}</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span style={{ color: '#F472B6', fontSize: 28, fontWeight: 700 }}>
                        ¥{pkg.price_cny}
                      </span>
                      {pkg.original_price_cny && pkg.original_price_cny > pkg.price_cny && (
                        <span style={{
                          color: '#6B7280', fontSize: 13, textDecoration: 'line-through',
                        }}>
                          ¥{pkg.original_price_cny}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>
                      {(pkg.credits + pkg.bonus_credits).toLocaleString()}
                      <span style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 400, marginLeft: 4 }}>credits</span>
                    </p>
                    <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-0.5">
                      ¥{pricePerCredit}/credit
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="px-2 py-1 rounded-md" style={{ background: 'rgba(103,232,249,0.12)', border: '1px solid rgba(103,232,249,0.3)' }}>
                    <span style={{ color: '#67E8F9', fontSize: 11 }}>{pkg.credits} 主</span>
                  </div>
                  {pkg.bonus_credits > 0 && (
                    <div className="px-2 py-1 rounded-md flex items-center gap-1" style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.3)' }}>
                      <Sparkles size={10} color="#F472B6" />
                      <span style={{ color: '#F472B6', fontSize: 11 }}>+{pkg.bonus_credits} 赠送</span>
                    </div>
                  )}
                </div>

                <p style={{ color: '#6B7280', fontSize: 10 }} className="mb-2.5">
                  有效期 {pkg.validity_days} 天
                </p>

                <button
                  onClick={() => setConfirming(pkg)}
                  disabled={purchasing === pkg.id}
                  className="w-full py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                  style={{
                    background: isHot
                      ? 'linear-gradient(135deg, #F472B6 0%, #EC4899 100%)'
                      : 'rgba(196,181,253,0.2)',
                    color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                  }}
                >
                  {purchasing === pkg.id ? (
                    <><Loader2 size={14} className="animate-spin" /> 处理中...</>
                  ) : (
                    <>立即购买</>
                  )}
                </button>
              </GlassCard>
            );
          })
        )}

        <GlassCard>
          <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6 }}>
            <strong style={{ color: '#FFFFFF' }}>关于加油包:</strong><br />
            · 微信 H5 支付,扫码/跳转完成 → 立即到账<br />
            · 加油包 credits 长期有效(180-365 天),不清零<br />
            · 单 credit 越买越便宜,推荐「企业包」单价 ¥0.107<br />
            · 余额不足时,生成会失败并提示充值,不会乱扣
          </p>
        </GlassCard>
      </div>

      {/* 确认弹窗 */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => !purchasing && setConfirming(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl p-5"
            style={{ background: '#1E1B2E', border: '1px solid rgba(196,181,253,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }} className="mb-1">
              确认购买 {confirming.name}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-3">
              ¥{confirming.price_cny} → +{(confirming.credits + confirming.bonus_credits).toLocaleString()} credits
            </p>
            <div
              className="rounded-lg p-3 mb-4"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <p style={{ color: '#10B981', fontSize: 11 }}>
                ✓ 微信支付 H5 · 安全便捷 · 立即到账
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={!!purchasing}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 13 }}
              >
                取消
              </button>
              <button
                onClick={() => handlePurchase(confirming)}
                disabled={!!purchasing}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #07C160 0%, #06AD56 100%)', color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}
              >
                {purchasing ? <><Loader2 size={14} className="animate-spin" /> 处理中</> : '微信支付'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 等待支付/已支付 overlay */}
      {order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: 'linear-gradient(160deg, #1E1B2E 0%, #2A2540 100%)',
              border: '1px solid rgba(196,181,253,0.3)',
            }}
          >
            {orderStatus === 'paid' ? (
              <>
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
                >
                  <CheckCircle2 size={28} color="#FFFFFF" />
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, textAlign: 'center' }} className="mb-1">
                  支付成功
                </p>
                <p style={{ color: '#10B981', fontSize: 13, textAlign: 'center' }} className="mb-3">
                  +{order.creditsToGrant + order.bonusCredits} credits 已到账
                </p>
                {balanceAfter !== null && (
                  <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }} className="mb-4">
                    当前余额:<span style={{ color: '#FFFFFF', fontWeight: 600 }}>{balanceAfter}</span> credits
                  </p>
                )}
                <button
                  onClick={handleCloseOrder}
                  className="w-full py-2.5 rounded-lg"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}
                >
                  完成
                </button>
              </>
            ) : orderStatus === 'failed' || orderStatus === 'expired' ? (
              <>
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(239,68,68,0.2)' }}
                >
                  <AlertCircle size={28} color="#EF4444" />
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, textAlign: 'center' }} className="mb-1">
                  {orderStatus === 'expired' ? '订单已过期' : '支付未完成'}
                </p>
                <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }} className="mb-4">
                  可关闭后重新下单
                </p>
                <button
                  onClick={handleCloseOrder}
                  className="w-full py-2.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 13 }}
                >
                  关闭
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <Loader2 size={36} color="#07C160" className="animate-spin" />
                </div>
                <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, textAlign: 'center' }} className="mb-1">
                  正在等待支付
                </p>
                <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }} className="mb-3">
                  {order.packageName} · ¥{order.amountCny}
                </p>
                <div
                  className="rounded-lg p-3 mb-3"
                  style={{ background: 'rgba(7,193,96,0.1)', border: '1px solid rgba(7,193,96,0.3)' }}
                >
                  <p style={{ color: '#07C160', fontSize: 11, lineHeight: 1.5 }}>
                    📱 已为你打开微信支付页面,请在新标签中完成付款<br />
                    付款成功后,本页会自动到账
                  </p>
                </div>
                <p style={{ color: '#6B7280', fontSize: 10, textAlign: 'center' }} className="mb-3">
                  订单号 {order.outTradeNo.slice(0, 16)}...
                </p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleReopenH5}
                    className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                    style={{ background: 'rgba(7,193,96,0.2)', color: '#07C160', fontSize: 12, fontWeight: 600 }}
                  >
                    <ExternalLink size={12} /> 重新打开
                  </button>
                  <button
                    onClick={handleManualRefresh}
                    className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}
                  >
                    <RefreshCw size={12} /> 已支付,刷新
                  </button>
                </div>
                <button
                  onClick={handleCloseOrder}
                  className="w-full py-2 rounded-lg"
                  style={{ background: 'transparent', color: '#6B7280', fontSize: 11 }}
                >
                  取消订单
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PackagesPage() {
  return (
    <ProtectedRoute>
      <PackagesContent />
    </ProtectedRoute>
  );
}
