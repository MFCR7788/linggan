'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X, Zap } from 'lucide-react';

interface InsufficientCreditsDetail {
  required: number;
  available: number;
  message: string;
}

/**
 * 全局监听 `credits:insufficient` 自定义事件,余额不足时弹窗引导用户充值
 * 由 apiClient 在收到 402 + code=INSUFFICIENT_CREDITS 时派发
 */
export function InsufficientCreditsModal() {
  const router = useRouter();
  const [detail, setDetail] = useState<InsufficientCreditsDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<InsufficientCreditsDetail>;
      if (!ev.detail) return;
      setDetail(ev.detail);
    };
    window.addEventListener('credits:insufficient', handler);
    return () => window.removeEventListener('credits:insufficient', handler);
  }, []);

  if (!detail) return null;

  const shortage = Math.max(0, detail.required - detail.available);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={() => setDetail(null)}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 relative"
        style={{
          background: 'linear-gradient(160deg, #1E1B2E 0%, #2A2540 100%)',
          border: '1px solid rgba(244,114,182,0.4)',
          boxShadow: '0 12px 50px rgba(244,114,182,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setDetail(null)}
          className="absolute top-3 right-3 p-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <X size={14} color="#9CA3AF" />
        </button>

        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{
            background: 'linear-gradient(135deg, #F472B6 0%, #EC4899 100%)',
            boxShadow: '0 6px 24px rgba(244,114,182,0.4)',
          }}
        >
          <Sparkles size={24} color="#FFFFFF" />
        </div>

        <p
          style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
          className="mb-1"
        >
          灵力不足
        </p>
        <p
          style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }}
          className="mb-4"
        >
          继续生成需要补充灵力
        </p>

        <div
          className="rounded-xl p-3 mb-4 space-y-1.5"
          style={{
            background: 'rgba(244,114,182,0.08)',
            border: '1px solid rgba(244,114,182,0.2)',
          }}
        >
          <div className="flex justify-between items-center">
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>本次消耗</span>
            <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
              {detail.required} 灵力
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>当前余额</span>
            <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>
              {detail.available} 灵力
            </span>
          </div>
          <div className="flex justify-between items-center pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#F472B6', fontSize: 12, fontWeight: 600 }}>还差</span>
            <span style={{ color: '#F472B6', fontSize: 14, fontWeight: 700 }}>
              {shortage} 灵力
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setDetail(null)}
            className="flex-1 py-2.5 rounded-lg"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#9CA3AF',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            稍后再说
          </button>
          <button
            onClick={() => {
              setDetail(null);
              router.push('/profile/billing/packages');
            }}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, #F472B6 0%, #EC4899 100%)',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 4px 16px rgba(244,114,182,0.4)',
            }}
          >
            <Zap size={14} /> 立即充值
          </button>
        </div>

        <p
          style={{ color: '#6B7280', fontSize: 10, textAlign: 'center' }}
          className="mt-3"
        >
          首充体验包 ¥29 = 120 灵力 · 长期有效
        </p>
      </div>
    </div>
  );
}
