'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet, TrendingUp, TrendingDown, Package, Sparkles, ArrowRight, RefreshCw,
  Clock, ChevronLeft, Check, AlertCircle, Loader2,
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
