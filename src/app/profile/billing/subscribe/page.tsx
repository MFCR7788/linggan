'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Check, Loader2, ArrowLeft, Star, Crown, Gift, Zap,
  CheckCircle2, AlertCircle, RefreshCw, ExternalLink,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { useToast } from '@/components/Toast';
import { ProtectedRoute } from '@/components';
import { apiClient } from '@/lib/api-client';

interface Tier {
  tier: string;
  name: string;
  monthly_price_cny: number;
  monthly_credits: number;
  description: string | null;
  features: string[];
  sort_order: number;
}

interface OrderInfo {
  outTradeNo: string;
  h5Url: string;
  amountCny: number;
  creditsToGrant: number;
  expiresAt: string;
  tierName: string;
}

type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

const TIER_ICONS: Record<string, any> = {
  free: Gift,
  basic: Star,
  pro: Sparkles,
  studio: Crown,
  enterprise: Zap,
};

const TIER_COLORS: Record<string, string> = {
  free: '#9CA3AF',
  basic: '#67E8F9',
  pro: '#F472B6',
  studio: '#A78BFA',
  enterprise: '#FCD34D',
};

function SubscribeContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [currentTier, setCurrentTier] = useState('free');
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Tier | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<{ tiers: Tier[]; currentTier: string }>('/subscriptions');
      if (r.success) {
        setTiers(r.data!.tiers || []);
        setCurrentTier(r.data!.currentTier || 'free');
      }
    } catch (e: any) {
      showToast(e?.message || '查询失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  useEffect(() => { load(); }, []);

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
        // 同步当前套餐
        await load();
        showToast(`订阅成功!首月赠送 ${r.data.creditsGranted} 灵力`, 'success');
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

  // 真实微信支付流程(订阅)
  const handleSubscribePaid = async (tier: Tier) => {
    setSubscribing(tier.tier);
    try {
      const r = await apiClient.post<{
        outTradeNo: string;
        h5Url: string;
        amountCny: number;
        creditsToGrant: number;
        expiresAt: string;
      }>('/pay/wechat/h5/create', { type: 'subscription', id: tier.tier });

      if (r.success && r.data) {
        const orderInfo: OrderInfo = { ...r.data, tierName: tier.name };
        setOrder(orderInfo);
        setOrderStatus('pending');
        setConfirming(null);
        window.open(r.data.h5Url, '_blank');
        startPolling(r.data.outTradeNo);
      } else {
        showToast(r.error || '下单失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '下单失败', 'error');
    } finally {
      setSubscribing(null);
    }
  };

  // 降级到免费(无支付)
  const handleDowngrade = async (tier: Tier) => {
    setSubscribing(tier.tier);
    try {
      const r = await apiClient.post<{ tier: string }>('/subscriptions', { tier: 'free' });
      if (r.success) {
        showToast('已降级到免费版,当前订阅周期结束后生效', 'success');
        setConfirming(null);
        setCurrentTier(r.data!.tier);
        setTimeout(() => router.push('/profile/billing'), 1500);
      } else {
        showToast(r.error || '降级失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '降级失败', 'error');
    } finally {
      setSubscribing(null);
    }
  };

  // 统一入口:确认弹窗的"确认订阅"按钮
  const handleConfirm = (tier: Tier) => {
    if (tier.tier === 'free') {
      handleDowngrade(tier);
    } else {
      handleSubscribePaid(tier);
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
        title="订阅套餐"
        showBack
        onBack={() => router.push('/profile/billing')}
      />

      <div className="flex-1 px-4 pt-4 space-y-3">
        <GlassCard>
          <div className="flex items-center gap-2">
            <Sparkles size={20} color="#F472B6" />
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>订阅 = 每月自动送灵力</p>
              <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                月底未消耗完的订阅灵力会清零(加油包余额不受影响)
              </p>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} color="#9CA3AF" className="animate-spin" />
          </div>
        ) : (
          tiers.map((tier) => {
            const isCurrent = tier.tier === currentTier;
            const isFree = tier.tier === 'free';
            const Icon = TIER_ICONS[tier.tier] || Star;
            const color = TIER_COLORS[tier.tier] || '#9CA3AF';
            return (
              <GlassCard key={tier.tier} className="relative">
                {isCurrent && (
                  <div
                    className="absolute -top-2 right-3 px-2.5 py-0.5 rounded-md"
                    style={{
                      background: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
                      color: '#FFFFFF',
                      fontSize: 10, fontWeight: 700,
                    }}
                  >
                    当前套餐
                  </div>
                )}

                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}20`, border: `1px solid ${color}44` }}
                  >
                    <Icon size={18} color={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>{tier.name}</p>
                    {tier.description && (
                      <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">{tier.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                  <span style={{ color: color, fontSize: 26, fontWeight: 700 }}>
                    {isFree ? '免费' : `¥${tier.monthly_price_cny}`}
                  </span>
                  {!isFree && (
                    <span style={{ color: '#9CA3AF', fontSize: 12 }}>/ 月</span>
                  )}
                </div>

                <div
                  className="px-3 py-2 rounded-lg mb-3"
                  style={{ background: `${color}15`, border: `1px solid ${color}33` }}
                >
                  <p style={{ color: color, fontSize: 13, fontWeight: 600 }}>
                    {isFree ? `每月 ${tier.monthly_credits} 灵力(试用)` : `每月 ${tier.monthly_credits} 灵力`}
                  </p>
                </div>

                {/* 特性列表 */}
                {tier.features && tier.features.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {tier.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <Check size={12} color={color} className="mt-0.5 flex-shrink-0" />
                        <span style={{ color: '#D1D5DB', fontSize: 11, lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setConfirming(tier)}
                  disabled={isCurrent || subscribing === tier.tier}
                  className="w-full py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                  style={{
                    background: isCurrent
                      ? 'rgba(255,255,255,0.05)'
                      : isFree
                      ? 'rgba(156,163,175,0.2)'
                      : `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                    color: isCurrent ? '#6B7280' : '#FFFFFF',
                    fontSize: 13, fontWeight: 600,
                    cursor: isCurrent ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCurrent ? (
                    <>当前套餐</>
                  ) : isFree ? (
                    <>降级到免费版</>
                  ) : subscribing === tier.tier ? (
                    <><Loader2 size={14} className="animate-spin" /> 处理中...</>
                  ) : (
                    <>立即订阅</>
                  )}
                </button>
              </GlassCard>
            );
          })
        )}

        {/* 说明 */}
        <GlassCard>
          <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.6 }}>
            <strong style={{ color: '#FFFFFF' }}>关于订阅:</strong><br />
            · 微信 H5 支付,跳转微信 → 完成 → 立即生效<br />
            · 月底未消耗完的订阅赠送灵力会清零(加油包余额不受影响)<br />
            · 升级套餐立即生效,首月灵力按新档位赠送<br />
            · 降级套餐当前周期结束后生效,已赠送灵力不退<br />
            · 单灵力越买越便宜,Studio(¥0.166) / 企业(¥0.167) 是 ROI 最高的档位
          </p>
        </GlassCard>
      </div>

      {/* 确认弹窗 */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => !subscribing && setConfirming(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl p-5"
            style={{ background: '#1E1B2E', border: '1px solid rgba(196,181,253,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }} className="mb-1">
              {confirming.tier === 'free' ? `降级到 ${confirming.name}` : `确认订阅 ${confirming.name}`}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-3">
              {confirming.tier === 'free'
                ? '降级到免费版,当前订阅周期结束后生效'
                : `¥${confirming.monthly_price_cny}/月 · 每月赠送 ${confirming.monthly_credits} 灵力 · 30 天`}
            </p>
            {confirming.tier !== 'free' && (
              <div
                className="rounded-lg p-3 mb-4"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <p style={{ color: '#10B981', fontSize: 11 }}>
                  ✓ 微信支付 H5 · 安全便捷 · 支付成功立即生效
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={!!subscribing}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 13 }}
              >
                取消
              </button>
              <button
                onClick={() => handleConfirm(confirming)}
                disabled={!!subscribing}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                style={{
                  background: confirming.tier === 'free'
                    ? 'rgba(156,163,175,0.3)'
                    : 'linear-gradient(135deg, #07C160 0%, #06AD56 100%)',
                  color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                }}
              >
                {subscribing ? (
                  <><Loader2 size={14} className="animate-spin" /> 处理中</>
                ) : confirming.tier === 'free' ? (
                  '确认降级'
                ) : (
                  '微信支付'
                )}
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
                  订阅成功
                </p>
                <p style={{ color: '#10B981', fontSize: 13, textAlign: 'center' }} className="mb-3">
                  {order.tierName} · 首月 +{order.creditsToGrant} 灵力 已到账
                </p>
                {balanceAfter !== null && (
                  <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }} className="mb-4">
                    当前余额:<span style={{ color: '#FFFFFF', fontWeight: 600 }}>{balanceAfter}</span> 灵力
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
                  可关闭后重新订阅
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
                  {order.tierName} · ¥{order.amountCny}/月
                </p>
                <div
                  className="rounded-lg p-3 mb-3"
                  style={{ background: 'rgba(7,193,96,0.1)', border: '1px solid rgba(7,193,96,0.3)' }}
                >
                  <p style={{ color: '#07C160', fontSize: 11, lineHeight: 1.5 }}>
                    📱 已为你打开微信支付页面,请在新标签中完成付款<br />
                    付款成功后,本月灵力将自动到账
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

export default function SubscribePage() {
  return (
    <ProtectedRoute>
      <SubscribeContent />
    </ProtectedRoute>
  );
}
