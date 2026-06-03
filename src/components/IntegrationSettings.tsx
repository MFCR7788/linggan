'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Clock, Key, ExternalLink, Copy, Check, RotateCcw,
  X, Eye, EyeOff, AlertTriangle, Settings as SettingsIcon, Sparkles, Loader2,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassInput } from '@/components/GlassInput';
import { useToast } from '@/components/Toast';
import { apiClient } from '@/lib/api-client';

// ====== 类型 ======

interface PlatformSetting {
  keyName: string;
  isConfigured: boolean;
  hasValue: boolean;
  configuredAt: string | null;
  configuredBy: string | null;
  description: string;
  applyUrl: string | null;
  category: 'crypto' | 'cron' | 'oauth';
}

const CATEGORY_META: Record<PlatformSetting['category'], { label: string; color: string; icon: React.ReactNode }> = {
  crypto: { label: '加密密钥', color: '#8B5CF6', icon: <ShieldCheck size={14} /> },
  cron:   { label: '定时鉴权', color: '#F59E0B', icon: <Clock size={14} /> },
  oauth:  { label: '平台凭证', color: '#3B82F6', icon: <Key size={14} /> },
};

const FRIENDLY_NAME: Record<string, string> = {
  PLATFORM_ENCRYPTION_KEY: '平台 Token 加密密钥',
  CRON_SECRET: 'Cron 鉴权密钥',
  WECHAT_MP_APP_ID: '微信公众号 AppID',
  WECHAT_MP_APP_SECRET: '微信公众号 AppSecret',
  WEIBO_APP_KEY: '微博 App Key',
  WEIBO_APP_SECRET: '微博 App Secret',
};

const CAN_AUTO_GENERATE = new Set(['PLATFORM_ENCRYPTION_KEY', 'CRON_SECRET']);

// ====== 主组件 ======

export function IntegrationSettings() {
  const router = useRouter();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [autoGenFor, setAutoGenFor] = useState<string | null>(null);
  const [autoGenValue, setAutoGenValue] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const resp = await apiClient.get<{ settings: PlatformSetting[] }>('/admin/platform-settings');
    if (resp.success && resp.data) {
      setSettings(resp.data.settings);
    } else {
      showToast(resp.error || '加载失败', 'error');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const configuredCount = settings.filter(s => s.isConfigured).length;
  const totalCount = settings.length;

  const handleDelete = async (keyName: string) => {
    if (!confirm(`确定清空 ${keyName} 吗？此操作不可撤销。`)) return;
    const resp = await apiClient.delete<{ ok: boolean }>(`/admin/platform-settings?keyName=${encodeURIComponent(keyName)}`);
    if (resp.success) {
      showToast('已清空', 'success');
      load();
    } else {
      showToast(resp.error || '清空失败', 'error');
    }
  };

  const handleAutoGenerate = async (keyName: string) => {
    setAutoGenFor(keyName);
    setAutoGenValue(null);
    const resp = await apiClient.post<{ keyName: string; value: string }>(
      `/admin/platform-settings?action=auto-generate&keyName=${encodeURIComponent(keyName)}`,
      {}
    );
    if (resp.success && resp.data) {
      setAutoGenValue(resp.data.value);
      load();
    } else {
      showToast(resp.error || '生成失败', 'error');
      setAutoGenFor(null);
    }
  };

  // 按 category 分组
  const grouped = settings.reduce<Record<string, PlatformSetting[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2">
        <Loader2 size={18} className="animate-spin" color="#9CA3AF" />
        <span style={{ color: '#9CA3AF', fontSize: 13 }}>加载集成配置...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部进度 banner */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>集成配置进度</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
              配置越多解锁功能越多（多平台 OAuth 发布、定时任务、AES 加密）
            </p>
          </div>
          <GlassBadge color={configuredCount === totalCount ? 'success' : 'primary'}>
            {configuredCount}/{totalCount}
          </GlassBadge>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${totalCount > 0 ? (configuredCount / totalCount) * 100 : 0}%`,
              background: 'linear-gradient(to right, #3B82F6, #8B5CF6)',
            }}
          />
        </div>
        <div
          className="mt-3 px-3 py-2 rounded-lg flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle size={14} color="#FDE047" className="flex-shrink-0 mt-0.5" />
          <p style={{ color: '#FDE68A', fontSize: 11, lineHeight: 1.5 }}>
            站内只是"配置中心"，生效需把值同步到 Vercel → Settings → Environment Variables → 重新部署。
          </p>
        </div>
      </GlassCard>

      {/* 6 行按 category 分组 */}
      {(['crypto', 'cron', 'oauth'] as const).map((cat) => {
        const items = grouped[cat] || [];
        if (items.length === 0) return null;
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span style={{ color: meta.color }}>{meta.icon}</span>
              <span style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
              <span style={{ color: '#6B7280', fontSize: 11 }}>· {items.length} 项</span>
            </div>
            {items.map((s) => (
              <SettingRow
                key={s.keyName}
                setting={s}
                onEdit={() => setEditingKey(s.keyName)}
                onDelete={() => handleDelete(s.keyName)}
                onAutoGenerate={() => handleAutoGenerate(s.keyName)}
              />
            ))}
          </div>
        );
      })}

      {/* 编辑 modal */}
      {editingKey && (
        <EditValueModal
          keyName={editingKey}
          onClose={() => setEditingKey(null)}
          onSaved={() => {
            setEditingKey(null);
            load();
          }}
        />
      )}

      {/* 自动生成结果 modal */}
      {autoGenFor && autoGenValue && (
        <AutoGenResultModal
          keyName={autoGenFor}
          value={autoGenValue}
          onClose={() => {
            setAutoGenFor(null);
            setAutoGenValue(null);
          }}
        />
      )}
    </div>
  );
}

// ====== 单行 ======

function SettingRow({
  setting, onEdit, onDelete, onAutoGenerate,
}: {
  setting: PlatformSetting;
  onEdit: () => void;
  onDelete: () => void;
  onAutoGenerate: () => void;
}) {
  const canAutoGen = CAN_AUTO_GENERATE.has(setting.keyName);
  const friendly = FRIENDLY_NAME[setting.keyName] || setting.keyName;

  return (
    <GlassCard className="!p-3">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: setting.isConfigured ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
            border: setting.isConfigured ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {setting.isConfigured ? (
            <Check size={16} color="#86EFAC" />
          ) : (
            <X size={16} color="#6B7280" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{friendly}</p>
            <GlassBadge color={setting.isConfigured ? 'success' : 'default'}>
              {setting.isConfigured ? '已配置' : '未配置'}
            </GlassBadge>
          </div>
          <p style={{ color: '#9CA3AF', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            {setting.keyName}
          </p>
          <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.5 }}>{setting.description}</p>
          {setting.applyUrl && (
            <a
              href={setting.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2"
              style={{ color: '#93C5FD', fontSize: 11 }}
            >
              <ExternalLink size={11} /> 去申请
            </a>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {canAutoGen && (
          <PrimaryButton
            size="sm"
            variant="secondary"
            onClick={onAutoGenerate}
            fontSize={12}
            style={{ flex: 1 }}
          >
            <Sparkles size={12} /> 自动生成
          </PrimaryButton>
        )}
        <PrimaryButton
          size="sm"
          variant="ghost"
          onClick={onEdit}
          fontSize={12}
          style={{ flex: 1 }}
        >
          {setting.isConfigured ? '更新' : '填入'}
        </PrimaryButton>
        {setting.isConfigured && (
          <button
            onClick={onDelete}
            className="px-3 rounded-lg"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#FCA5A5',
            }}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </GlassCard>
  );
}

// ====== 填入/更新 modal ======

function EditValueModal({
  keyName, onClose, onSaved,
}: {
  keyName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) {
      showToast('值不能为空', 'error');
      return;
    }
    setSaving(true);
    const resp = await apiClient.put<{ ok: boolean }>('/admin/platform-settings', { keyName, value });
    if (resp.success) {
      showToast('已保存(别忘了同步到 Vercel)', 'success');
      onSaved();
    } else {
      showToast(resp.error || '保存失败', 'error');
    }
    setSaving(false);
  };

  const friendly = FRIENDLY_NAME[keyName] || keyName;
  const isSecret = keyName.includes('SECRET') || keyName.includes('KEY') || keyName.includes('TOKEN');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'rgba(10,22,41,0.95)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>{friendly}</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{keyName}</p>
            </div>
            <button onClick={onClose} className="p-1">
              <X size={18} color="#9CA3AF" />
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p style={{ color: '#D1D5DB', fontSize: 12 }}>
            粘贴从 Vercel / 平台开放平台复制的值。站内有加密备份，但代码读的是 Vercel env，所以同步到 Vercel 才会真正生效。
          </p>
          <div className="relative">
            <GlassInput
              type={isSecret && !showValue ? 'password' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isSecret ? '••••••••' : '输入值'}
            />
            {isSecret && (
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showValue ? <EyeOff size={14} color="#9CA3AF" /> : <Eye size={14} color="#9CA3AF" />}
              </button>
            )}
          </div>
        </div>
        <div className="p-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <PrimaryButton variant="ghost" onClick={onClose} fontSize={13} style={{ flex: 1 }}>
            取消
          </PrimaryButton>
          <PrimaryButton onClick={handleSave} loading={saving} fontSize={13} style={{ flex: 1 }}>
            保存
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ====== 自动生成结果 modal(只显示一次) ======

function AutoGenResultModal({
  keyName, value, onClose,
}: {
  keyName: string;
  value: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showToast('已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('复制失败,请手动选择', 'error');
    }
  };

  const friendly = FRIENDLY_NAME[keyName] || keyName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'rgba(10,22,41,0.98)',
          border: '1px solid rgba(139,92,246,0.5)',
          boxShadow: '0 0 40px rgba(139,92,246,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={20} color="#C4B5FD" />
            <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>已生成 {friendly}</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div
            className="px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <AlertTriangle size={14} color="#FCA5A5" className="flex-shrink-0 mt-0.5" />
            <p style={{ color: '#FCA5A5', fontSize: 11, lineHeight: 1.5 }}>
              此值仅显示一次。立即复制到 Vercel → Environment Variables → 重新部署。
            </p>
          </div>
          <div
            className="px-3 py-2.5 rounded-lg font-mono text-xs break-all"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#A7F3D0',
              maxHeight: 120,
              overflow: 'auto',
            }}
          >
            {value}
          </div>
        </div>
        <div className="p-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <PrimaryButton
            onClick={handleCopy}
            fontSize={13}
            style={{ flex: 1, background: copied ? 'rgba(34,197,94,0.4)' : undefined }}
          >
            {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制</>}
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onClose} fontSize={13}>
            关闭
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
