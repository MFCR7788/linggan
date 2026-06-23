'use client';

// 新用户引导 — 首次进入 AI 创作中心时,弹 modal 让用户选账号类型
// 设计:全屏 modal,8 个大卡片 2 列 4 行,选完跳 /ai 看推荐组合
// 跳过:不强制,降级到默认组合(账号类型为 null 时给通用推荐)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Sparkles } from 'lucide-react';
import {
  ACCOUNT_TYPE_PRESETS,
  type AccountTypeId,
} from '@/lib/account-presets';
import { useAccountType } from '@/hooks/use-account-type';

interface AccountTypeOnboardingProps {
  open: boolean;
  onClose: () => void;
  /** 选完是否自动跳转 /ai(默认 true) */
  navigateAfter?: boolean;
}

export function AccountTypeOnboarding({
  open,
  onClose,
  navigateAfter = true,
}: AccountTypeOnboardingProps) {
  const router = useRouter();
  const { setAccountType } = useAccountType();
  const [selected, setSelected] = useState<AccountTypeId | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSelect = async (type: AccountTypeId) => {
    if (saving) return;
    setSaving(true);
    setSelected(type);
    const result = await setAccountType(type);
    setSaving(false);
    if (result.ok) {
      onClose();
      if (navigateAfter) {
        router.push('/ai');
      }
    }
  };

  const handleSkip = () => {
    onClose();
    if (navigateAfter) {
      router.push('/ai');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={handleSkip}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(30,30,50,0.95), rgba(20,20,40,0.95))',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #F472B6, #8B5CF6)' }}
            >
              <Sparkles size={20} color="#FFFFFF" />
            </div>
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>
                选择你的账号类型
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                灵集将根据你的场景,推荐最佳视频创作组合
              </p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="p-1.5 rounded-lg hover:bg-white/10"
            aria-label="关闭"
          >
            <X size={18} color="#9CA3AF" />
          </button>
        </div>

        {/* 8 个账号类型卡片 */}
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {ACCOUNT_TYPE_PRESETS.map((preset) => {
            const isSelected = preset.id === selected;
            return (
              <button
                key={preset.id}
                onClick={() => handleSelect(preset.id)}
                className="text-left p-3 rounded-2xl transition-all active:scale-[0.97]"
                style={{
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(244,114,182,0.22), rgba(139,92,246,0.22))'
                    : 'rgba(255,255,255,0.04)',
                  border: isSelected
                    ? '1.5px solid rgba(244,114,182,0.6)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ fontSize: 22 }}>{preset.emoji}</span>
                  <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
                    {preset.label}
                  </span>
                  {isSelected && <Check size={14} color="#F9A8D4" className="ml-auto" />}
                </div>
                <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4 }}>
                  {preset.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-center">
          <button
            onClick={handleSkip}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ color: '#9CA3AF' }}
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountTypeOnboarding;
