'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

const LOW_BALANCE_THRESHOLD = 20;
const DISMISS_KEY = 'lingji_low_balance_dismissed';
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // 6h 内不重复弹

/**
 * 余额 < 20 时,在 AI 创作中心顶部显示黄色横幅
 * - 拉取 /api/credits 拿余额
 * - 监听 `credits:insufficient` 事件,弹过后 6h 内不再弹
 * - 监听 `credits:updated` 事件,实时刷新余额
 */
export function CreditsWarningBanner() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  // 拉余额
  useEffect(() => {
    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const r = await apiClient.get<{ balance: number }>('/credits');
        if (!cancelled && r.success && typeof r.data?.balance === 'number') {
          setBalance(r.data.balance);
        }
      } catch {
        // 静默失败,不影响页面
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchBalance();

    // 检查是否被 dismiss 过(6h 内有效)
    try {
      const last = localStorage.getItem(DISMISS_KEY);
      if (last) {
        const ts = Number(last);
        if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
          setDismissed(true);
        } else {
          localStorage.removeItem(DISMISS_KEY);
        }
      }
    } catch {}

    return () => { cancelled = true; };
  }, []);

  // 监听余额更新事件(ai 路由扣点/支付成功时派发)
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ balance?: number }>;
      if (typeof ev.detail?.balance === 'number') {
        setBalance(ev.detail.balance);
        // 余额回升到阈值以上时,清掉 dismiss 标记(让横幅能再次出现)
        if (ev.detail.balance >= LOW_BALANCE_THRESHOLD) {
          setDismissed(false);
        }
      }
    };
    window.addEventListener('credits:updated', handler);
    return () => window.removeEventListener('credits:updated', handler);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const handleRecharge = () => {
    router.push('/profile/billing/packages');
  };

  // 加载中 / 余额充足 / 已关闭:不显示
  if (loading || dismissed || balance === null) return null;
  if (balance >= LOW_BALANCE_THRESHOLD) return null;

  return (
    <div
      className="mx-4 mt-3 rounded-xl p-3 flex items-center gap-2.5"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(217,119,6,0.12))',
        border: '1px solid rgba(245,158,11,0.4)',
        boxShadow: '0 2px 12px rgba(245,158,11,0.15)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(245,158,11,0.25)' }}
      >
        <AlertTriangle size={16} color="#FBBF24" />
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>
          余额仅剩 <span style={{ color: '#FCD34D' }}>{balance}</span> 灵力
        </p>
        <p style={{ color: '#D1D5DB', fontSize: 10, marginTop: 1 }}>
          建议充值以免生成中断
        </p>
      </div>
      <button
        onClick={handleRecharge}
        className="px-3 py-1.5 rounded-lg flex items-center gap-1 flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: 700,
          boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
        }}
      >
        <Zap size={11} /> 去充值
      </button>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-md flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)' }}
        aria-label="关闭"
      >
        <X size={12} color="#9CA3AF" />
      </button>
    </div>
  );
}
