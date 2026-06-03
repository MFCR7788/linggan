'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet, TrendingUp, TrendingDown, Package, Sparkles, ArrowRight, RefreshCw,
  Clock, ChevronLeft, Check, AlertCircle, Loader2, Crown, XCircle,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useToast } from '@/components/Toast';
import { ProtectedRoute } from '@/components';
import { apiClient } from '@/lib/api-client';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  balanceAfter: number;
  source: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface SubscriptionRecord {
  id: string;
  tier: string;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  monthly_credits: number;
  started_at: string;
  expires_at: string;
  cancelled_at: string | null;
  auto_renew: boolean;
  payment_method: string;
  external_subscription_id: string | null;
  created_at: string;
}

const SUB_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: '生效中', color: '#34D399', bg: 'rgba(52,211,153,0.15)' },
  cancelled: { label: '已取消', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  expired:   { label: '已过期', color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)' },
  past_due:  { label: '待续费', color: '#FCA5A5', bg: 'rgba(252,165,165,0.15)' },
};

const TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  subscription_grant:    { label: '订阅赠送', color: '#34D399', icon: Sparkles },
  package_purchase:      { label: '购买加油包', color: '#67E8F9', icon: Package },
  consume:               { label: 'AI 消耗', color: '#FCA5A5', icon: TrendingDown },
  refund:                { label: '退款', color: '#FBBF24', icon: TrendingUp },
  admin_adjust:          { label: '管理员调整', color: '#C4B5FD', icon: Check },
  reset:                 { label: '月底清零', color: '#9CA3AF', icon: Clock },
  bonus_first_purchase:  { label: '首充赠送', color: '#F472B6', icon: Sparkles },
};

const TIER_LABELS: Record<string, string> = {
  free: '免费版',
  basic: '个人版',
  pro: '创作者版',
  studio: '工作室版',
  enterprise: '企业版',
};

const TIER_COLORS: Record<string, string> = {
  free: '#9CA3AF',
  basic: '#67E8F9',
  pro: '#F472B6',
  studio: '#A78BFA',
  enterprise: '#FCD34D',
};

function BillingContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [tier, setTier] = useState('free');
  const [lifetimeConsumed, setLifetimeConsumed] = useState(0);
  const [lifetimePurchased, setLifetimePurchased] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<{
        balance: number; tier: string;
        lifetimeConsumed: number; lifetimePurchased: number;
        transactions: Transaction[];
      }>('/api/credits?t=30');
      if (r.success) {
        setBalance(r.data!.balance);
        setTier(r.data!.tier);
        setLifetimeConsumed(r.data!.lifetimeConsumed);
        setLifetimePurchased(r.data!.lifetimePurchased);
        setTransactions(r.data!.transactions || []);
      }
    } catch (e: any) {
      showToast(e?.message || '查询失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadSubs = async () => {
    try {
      const r = await apiClient.get<{ subscriptions: SubscriptionRecord[] }>('/api/subscriptions');
      if (r.success && r.data?.subscriptions) {
        setSubscriptions(r.data.subscriptions);
      }
    } catch (e) {
      // 静默
    }
  };

  useEffect(() => { loadSubs(); }, []);

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const r = await apiClient.delete<{ cancelled: any[]; message: string }>('/api/subscriptions');
      if (r.success) {
        showToast(r.data?.message || '已取消自动续费,当前订阅将持续到当前周期结束', 'success');
        setConfirmCancel(false);
        await loadSubs();
      } else {
        showToast(r.error || '取消失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '取消失败', 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <TopNav
        title="我的灵感点"
        showBack
        onBack={() => router.push('/profile')}
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 余额总览 */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(196,181,253,0.2)', border: '1px solid rgba(196,181,253,0.4)' }}
              >
                <Wallet size={18} color="#C4B5FD" />
              </div>
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11 }}>当前余额</p>
                <p style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 700 }}>
                  {loading ? '—' : balance.toLocaleString()}
                  <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 400, marginLeft: 4 }}>credits</span>
                </p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <RefreshCw size={14} color="#9CA3AF" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* 订阅档位 */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span
              style={{
                color: TIER_COLORS[tier] || '#9CA3AF',
                fontSize: 12, fontWeight: 600,
                padding: '2px 8px', borderRadius: 6,
                background: `${TIER_COLORS[tier]}20` || 'rgba(156,163,175,0.15)',
              }}
            >
              {TIER_LABELS[tier] || tier}
            </span>
            <span style={{ color: '#9CA3AF', fontSize: 11 }} className="flex-1">
              {tier === 'free' ? '升级订阅享更多 credits' : '订阅周期内,credits 每月发放'}
            </span>
            <button
              onClick={() => router.push('/profile/billing/packages')}
              className="text-xs flex items-center gap-1"
              style={{ color: '#C4B5FD', fontSize: 12 }}
            >
              充值/升级 <ArrowRight size={12} />
            </button>
          </div>

          {/* 累计统计 */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div
              className="rounded-lg p-2.5"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <p style={{ color: '#FCA5A5', fontSize: 10 }}>累计消耗</p>
              <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 600 }} className="mt-0.5">
                {lifetimeConsumed.toLocaleString()}
              </p>
            </div>
            <div
              className="rounded-lg p-2.5"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}
            >
              <p style={{ color: '#6EE7B7', fontSize: 10 }}>累计充值</p>
              <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 600 }} className="mt-0.5">
                {lifetimePurchased.toLocaleString()}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* 快捷入口 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => router.push('/profile/billing/packages')}
            className="p-3 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(103,232,249,0.12)', border: '1px solid rgba(103,232,249,0.3)' }}
          >
            <Package size={18} color="#67E8F9" />
            <div className="text-left">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>加油包</p>
              <p style={{ color: '#9CA3AF', fontSize: 10 }}>¥29 起,余额翻倍</p>
            </div>
          </button>
          <button
            onClick={() => router.push('/profile/billing/subscribe')}
            className="p-3 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.3)' }}
          >
            <Sparkles size={18} color="#F472B6" />
            <div className="text-left">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>订阅套餐</p>
              <p style={{ color: '#9CA3AF', fontSize: 10 }}>¥29/月起</p>
            </div>
          </button>
        </div>

        {/* 余额预警 */}
        {balance < 20 && !loading && (
          <GlassCard>
            <div className="flex items-center gap-2">
              <AlertCircle size={20} color="#FCA5A5" />
              <div className="flex-1">
                <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>余额不足</p>
                <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                  建议购买加油包或升级订阅,避免 AI 任务中断
                </p>
              </div>
              <button
                onClick={() => router.push('/profile/billing/packages')}
                className="px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(244,114,182,0.3)', color: '#F472B6', fontSize: 12, fontWeight: 600 }}
              >
                充值
              </button>
            </div>
          </GlassCard>
        )}

        {/* 订阅记录 */}
        {subscriptions.length > 0 && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Crown size={14} color="#C4B5FD" />
                <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>我的订阅</p>
              </div>
              <button
                onClick={() => router.push('/profile/billing/subscribe')}
                className="text-xs flex items-center gap-0.5"
                style={{ color: '#93C5FD' }}
              >
                管理 <ArrowRight size={12} />
              </button>
            </div>

            <div className="space-y-2">
              {subscriptions.map((sub) => {
                const statusMeta = SUB_STATUS_LABELS[sub.status] || SUB_STATUS_LABELS.expired;
                const tierColor = TIER_COLORS[sub.tier] || '#9CA3AF';
                const tierName = TIER_LABELS[sub.tier] || sub.tier;
                const expiresAt = new Date(sub.expires_at);
                const isActive = sub.status === 'active';
                const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
                return (
                  <div
                    key={sub.id}
                    className="rounded-lg p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${tierColor}20`, border: `1px solid ${tierColor}44` }}
                      >
                        <Crown size={14} color={tierColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{tierName}</p>
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: statusMeta.bg, color: statusMeta.color }}
                          >
                            {statusMeta.label}
                          </span>
                          {isActive && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{ background: sub.auto_renew ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)', color: sub.auto_renew ? '#34D399' : '#FBBF24' }}
                            >
                              {sub.auto_renew ? '自动续费' : '不续费'}
                            </span>
                          )}
                        </div>
                        <p style={{ color: '#9CA3AF', fontSize: 10 }} className="mt-1">
                          {sub.monthly_credits} credits/月 ·{' '}
                          {new Date(sub.started_at).toLocaleDateString('zh-CN')} ~ {expiresAt.toLocaleDateString('zh-CN')}
                        </p>
                        {isActive && (
                          <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-0.5">
                            {sub.auto_renew ? `${daysLeft} 天后自动续费` : `${daysLeft} 天后到期`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 活跃订阅:展示取消按钮 */}
                    {isActive && sub.auto_renew && (
                      <button
                        onClick={() => setConfirmCancel(true)}
                        className="w-full py-1.5 rounded-md text-xs flex items-center justify-center gap-1"
                        style={{ background: 'rgba(255,255,255,0.04)', color: '#9CA3AF' }}
                      >
                        <XCircle size={11} /> 取消自动续费
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* 流水 */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>最近流水</p>
            <p style={{ color: '#9CA3AF', fontSize: 10 }}>最近 30 条</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} color="#9CA3AF" className="animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 12 }} className="text-center py-6">
              暂无流水
            </p>
          ) : (
            <div className="space-y-1">
              {transactions.map((tx) => {
                const meta = TYPE_LABELS[tx.type] || { label: tx.type, color: '#9CA3AF', icon: Clock };
                const Icon = meta.icon;
                const isPositive = tx.amount > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-2.5 py-2 px-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${meta.color}20` }}
                    >
                      <Icon size={14} color={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 500 }} className="truncate">
                        {tx.description || meta.label}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-0.5">
                        {new Date(tx.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p style={{
                        color: isPositive ? '#34D399' : '#FCA5A5',
                        fontSize: 13, fontWeight: 600,
                      }}>
                        {isPositive ? '+' : ''}{tx.amount}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 9 }}>余 {tx.balanceAfter}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* 取消订阅确认弹窗 */}
      {confirmCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => !cancelling && setConfirmCancel(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: 'linear-gradient(160deg, #1E1B2E 0%, #2A2540 100%)',
              border: '1px solid rgba(251,191,36,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(251,191,36,0.15)' }}
            >
              <XCircle size={24} color="#FBBF24" />
            </div>
            <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700, textAlign: 'center' }} className="mb-1">
              确认取消自动续费?
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }} className="mb-4">
              取消后当前订阅仍可使用到本周期结束<br />
              周期结束后不再扣费,自动降级到免费版
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmCancel(false)}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#9CA3AF', fontSize: 13 }}
              >
                再想想
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}
              >
                {cancelling ? <><Loader2 size={14} className="animate-spin" /> 处理中</> : '确认取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <ProtectedRoute>
      <BillingContent />
    </ProtectedRoute>
  );
}
