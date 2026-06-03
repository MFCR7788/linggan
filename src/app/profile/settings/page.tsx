'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon, Shield, Bell, Plug, ChevronRight, Lock, LogOut,
  Smartphone, Edit3, Save, X, Check, AlertTriangle, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassInput } from '@/components/GlassInput';
import { useToast } from '@/components/Toast';
import { ProtectedRoute } from '@/components';
import { IntegrationSettings } from '@/components/IntegrationSettings';
import { useUser } from '@/hooks/use-user';
import { apiClient } from '@/lib/api-client';

// ====== 1. 资料 Section ======

function ProfileSection({ onSaved }: { onSaved: () => void }) {
  const { data: user } = useUser();
  const { showToast } = useToast();
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  const displayName = user?.username || user?.phone || '创作者';
  const displayPhone = user?.phone || '—';
  const initial = displayName.charAt(0).toUpperCase();

  const handleSave = async () => {
    setSaving(true);
    const resp = await apiClient.patch<{ user: any }>('/user/profile', {
      username: username.trim(),
      avatar_url: avatarUrl.trim() || null,
    });
    if (resp.success) {
      showToast('资料已保存', 'success');
      setEditing(false);
      onSaved();
    } else {
      showToast(resp.error || '保存失败', 'error');
    }
    setSaving(false);
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)' }}
        >
          <UserIcon size={16} color="#93C5FD" />
        </div>
        <div>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>资料</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>头像、昵称、手机号</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto px-3 py-1.5 rounded-lg flex items-center gap-1"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD', fontSize: 12 }}
          >
            <Edit3 size={12} /> 编辑
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{
            background: avatarUrl
              ? undefined
              : 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
            border: '2px solid rgba(59,130,246,0.5)',
            backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            overflow: 'hidden',
          }}
        >
          {!avatarUrl && <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{initial}</span>}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <GlassInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="昵称"
              maxLength={30}
            />
          ) : (
            <p style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700 }}>{displayName}</p>
          )}
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }} className="flex items-center gap-1">
            <Smartphone size={11} /> {displayPhone}
          </p>
        </div>
      </div>

      {editing && (
        <div className="space-y-3">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>头像 URL（可选，留空使用首字母）</p>
            <GlassInput
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div
            className="px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
          >
            <AlertTriangle size={12} color="#FDE047" className="flex-shrink-0 mt-0.5" />
            <p style={{ color: '#FDE68A', fontSize: 11, lineHeight: 1.5 }}>
              手机号如需修改，请联系客服（本期暂未开放自助换号）。
            </p>
          </div>
          <div className="flex gap-2">
            <PrimaryButton variant="ghost" onClick={() => setEditing(false)} fontSize={13} style={{ flex: 1 }}>
              取消
            </PrimaryButton>
            <PrimaryButton onClick={handleSave} loading={saving} fontSize={13} style={{ flex: 1 }}>
              <Save size={14} /> 保存
            </PrimaryButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ====== 2. 安全 Section ======

function SecuritySection() {
  const { showToast } = useToast();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOutAll = async () => {
    setSigningOut(true);
    const resp = await apiClient.post<{ revokedCount: number }>(
      '/user/security?action=sign-out-all',
      {}
    );
    if (resp.success) {
      const n = resp.data?.revokedCount || 0;
      showToast(n > 0 ? `已退出 ${n} 个设备` : '已发送退出指令', 'success');
      setShowSignOutConfirm(false);
    } else {
      showToast(resp.error || '退出失败', 'error');
    }
    setSigningOut(false);
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <Shield size={16} color="#FCA5A5" />
        </div>
        <div>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>安全</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>密码、登录设备、双因子</p>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setShowPasswordModal(true)}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <Lock size={16} color="#E5E7EB" />
          <span style={{ color: '#E5E7EB', fontSize: 13, flex: 1, textAlign: 'left' }}>修改密码</span>
          <ChevronRight size={14} color="#9CA3AF" />
        </button>
        <button
          onClick={() => setShowSignOutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <LogOut size={16} color="#FCA5A5" />
          <span style={{ color: '#FCA5A5', fontSize: 13, flex: 1, textAlign: 'left' }}>退出所有设备</span>
          <ChevronRight size={14} color="#9CA3AF" />
        </button>
        <div
          className="flex items-center gap-3 px-3 py-3 rounded-xl opacity-60"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <Shield size={16} color="#6B7280" />
          <span style={{ color: '#9CA3AF', fontSize: 13, flex: 1, textAlign: 'left' }}>双因子认证 (2FA)</span>
          <GlassBadge color="default">敬请期待</GlassBadge>
        </div>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
      {showSignOutConfirm && (
        <SignOutAllModal
          onClose={() => setShowSignOutConfirm(false)}
          onConfirm={handleSignOutAll}
          loading={signingOut}
        />
      )}
    </GlassCard>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!current) {
      showToast('请输入当前密码', 'error');
      return;
    }
    if (next.length < 8) {
      showToast('新密码至少 8 位', 'error');
      return;
    }
    if (next !== confirm) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    setSaving(true);
    const resp = await apiClient.post<{ ok: boolean }>(
      '/user/security?action=change-password',
      { currentPassword: current, newPassword: next }
    );
    if (resp.success) {
      showToast('密码已修改', 'success');
      onClose();
    } else {
      showToast(resp.error || '修改失败', 'error');
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'rgba(10,22,41,0.95)', border: '1px solid rgba(255,255,255,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>修改密码</p>
          <button onClick={onClose} className="p-1"><X size={18} color="#9CA3AF" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5 }}>
            修改密码后，所有其他设备会立即退出登录，需用新密码重新登录。
          </p>
          <div className="relative">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>当前密码</p>
            <GlassInput
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
            />
            <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-9">
              {showCurrent ? <EyeOff size={14} color="#9CA3AF" /> : <Eye size={14} color="#9CA3AF" />}
            </button>
          </div>
          <div className="relative">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>新密码（至少 8 位）</p>
            <GlassInput
              type={showNext ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="••••••••"
            />
            <button onClick={() => setShowNext(!showNext)} className="absolute right-3 top-9">
              {showNext ? <EyeOff size={14} color="#9CA3AF" /> : <Eye size={14} color="#9CA3AF" />}
            </button>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>确认新密码</p>
            <GlassInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
        <div className="p-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <PrimaryButton variant="ghost" onClick={onClose} fontSize={13} style={{ flex: 1 }}>取消</PrimaryButton>
          <PrimaryButton onClick={handleSubmit} loading={saving} fontSize={13} style={{ flex: 1 }}>
            <Check size={14} /> 确认修改
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function SignOutAllModal({
  onClose, onConfirm, loading,
}: { onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'rgba(10,22,41,0.95)', border: '1px solid rgba(239,68,68,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <LogOut size={20} color="#FCA5A5" />
          </div>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>退出所有设备？</p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
            所有其他设备会被立即退出登录。本设备也需重新登录。
          </p>
        </div>
        <div className="p-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <PrimaryButton variant="ghost" onClick={onClose} fontSize={13} style={{ flex: 1 }}>取消</PrimaryButton>
          <PrimaryButton
            onClick={onConfirm}
            loading={loading}
            fontSize={13}
            style={{ flex: 1, background: '#EF4444' }}
          >
            确认退出
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ====== 3. 通知 Section(link 风格) ======

function NotificationSection() {
  const router = useRouter();
  return (
    <GlassCard>
      <button
        onClick={() => router.push('/notification')}
        className="w-full flex items-center gap-3"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          <Bell size={16} color="#86EFAC" />
        </div>
        <div className="flex-1 text-left">
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>通知</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>管理发布提醒、热点告警、系统消息</p>
        </div>
        <ChevronRight size={16} color="#9CA3AF" />
      </button>
    </GlassCard>
  );
}

// ====== 主页面 ======

function SettingsContent() {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const { data: user } = useUser();

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <TopNav
        title="账号设置"
        showBack
        onBack={() => router.push('/profile')}
      />

      <div className="flex-1 px-4 pt-4 space-y-4">
        <ProfileSection onSaved={() => setTick(t => t + 1)} />
        <SecuritySection />
        <NotificationSection />

        {/* 集成 section(独立 section,使用共享组件) */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}
            >
              <Plug size={16} color="#C4B5FD" />
            </div>
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>平台集成</p>
              <p style={{ color: '#9CA3AF', fontSize: 11 }}>6 个 V2.0.2 env · 微信公众号/微博 OAuth · AES/Cron 密钥</p>
            </div>
          </div>
          <IntegrationSettings />
        </GlassCard>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
