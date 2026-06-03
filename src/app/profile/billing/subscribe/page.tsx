'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Check, X, Loader2, ArrowLeft, Star, Crown, Gift, Zap,
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

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<{ tiers: Tier[]; currentTier: string }>('/api/subscriptions');
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

  useEffect(() => { load(); }, []);

  const handleSubscribe = async (tier: Tier) => {
    setSubscribing(tier.tier);
    try {
      const r = await apiClient.post<{
        balanceAfter: number; creditsGranted: number; tier: string;
      }>('/api/subscriptions', { tier: tier.tier });
      if (r.success) {
        showToast(
          `订阅成功!本月赠送 ${r.data!.creditsGranted} credits,30 天后到期`,
          'success'
        );
        setConfirming(null);
        setCurrentTier(r.data!.tier);
        setTimeout(() => router.push('/profile/billing'), 1500);
      } else {
        showToast(r.error || '订阅失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '订阅失败', 'error');
    } finally {
      setSubscribing(null);
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
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>订阅 = 每月自动送 credits</p>
              <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                月底未消耗完的订阅 credits 会清零(加油包余额不受影响)
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
                    {isFree ? `每月 ${tier.monthly_credits} credits(试用)` : `每月 ${tier.monthly_credits} credits`}
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
            · 月底未消耗完的订阅赠送 credits 会清零(加油包余额不受影响)<br />
            · 升级套餐立即生效,首月 credits 按新档位赠送<br />
            · 降级套餐当前周期结束后生效,已赠送 credits 不退<br />
            · 单 credit 越买越便宜,Studio(¥0.166) / 企业(¥0.167) 是 ROI 最高的档位<br />
            · 当前 V2.0.3 试运行:订阅为模拟支付,真实微信/支付宝待 V2.0.4 接入
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
              确认订阅 {confirming.name}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-3">
              {confirming.tier === 'free'
                ? '降级到免费版,当前订阅周期结束后生效'
                : `¥${confirming.monthly_price_cny}/月 · 每月赠送 ${confirming.monthly_credits} credits · 30 天`}
            </p>
            {confirming.tier !== 'free' && (
              <div
                className="rounded-lg p-3 mb-4"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}
              >
                <p style={{ color: '#FBBF24', fontSize: 11 }}>
                  ⚠️ 当前为模拟支付(V2.0.3 试运行),真实微信/支付宝支付待接入
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
                onClick={() => handleSubscribe(confirming)}
                disabled={!!subscribing}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                style={{
                  background: `linear-gradient(135deg, ${TIER_COLORS[confirming.tier] || '#F472B6'} 0%, ${TIER_COLORS[confirming.tier] || '#EC4899'} 100%)`,
                  color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                }}
              >
                {subscribing ? <><Loader2 size={14} className="animate-spin" /> 处理中</> : '确认订阅'}
              </button>
            </div>
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
