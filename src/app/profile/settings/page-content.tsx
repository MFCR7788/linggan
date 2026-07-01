'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon, Shield, Bell, Plug, ChevronRight, Lock, LogOut,
  Smartphone, Edit3, Save, X, Check, AlertTriangle, Loader2, Eye, EyeOff,
  Sparkles, UserCircle2, Trash2, Video as VideoIcon, Camera,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassInput } from '@/components/GlassInput';
import { useToast } from '@/components/Toast';
import { ProtectedRoute } from '@/components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IntegrationSettings } from '@/components/IntegrationSettings';
import { useUser } from '@/hooks/use-user';
import { useAccountType } from '@/hooks/use-account-type';
import { ACCOUNT_TYPE_PRESETS, type AccountTypeId } from '@/lib/account-presets';
import { apiClient } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';

// ====== 1. 资料 Section ======

function ProfileSection({ onSaved }: { onSaved: () => void }) {
  const { data: user } = useUser();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  const displayName = user?.username || user?.phone || '创作者';
  const displayPhone = user?.phone || '—';
  const initial = displayName.charAt(0).toUpperCase();

  // 上传头像到 Supabase Storage
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // 校验
    if (!file.type.startsWith('image/')) {
      showToast('仅支持图片格式', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('头像不能超过 5MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `avatars/${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('lingji-media')
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl;
      if (publicUrl) {
        setAvatarUrl(publicUrl);
        // 同步保存到 profile
        await apiClient.patch('/user/profile', {
          username: username.trim() || user.username || '',
          avatar_url: publicUrl,
        });
        showToast('头像已更新', 'success');
        onSaved();
      }
    } catch (err: any) {
      showToast(err?.message || '上传失败', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await apiClient.patch<{ user: any }>('/user/profile', {
        username: username.trim(),
        avatar_url: avatarUrl || null,
      });
      if (resp && resp.success) {
        showToast('资料已保存', 'success');
        setEditing(false);
        onSaved();
      } else {
        showToast(resp?.error || '保存失败', 'error');
      }
    } catch {
      showToast('网络错误，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
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
        {/* 头像 — 点击上传 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 relative group"
          style={{
            background: avatarUrl
              ? `url(${avatarUrl}) center/cover`
              : 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
            border: '2px solid rgba(59,130,246,0.5)',
            overflow: 'hidden',
          }}
        >
          {!avatarUrl && <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{initial}</span>}
          {/* 上传遮罩 */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
            style={{ background: 'rgba(0,0,0,0.45)' }}
          >
            {uploading ? (
              <Loader2 size={20} color="#fff" className="animate-spin" />
            ) : (
              <Camera size={18} color="#fff" />
            )}
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarUpload}
        />

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
          <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }} className="flex items-center gap-1">
            <Smartphone size={11} /> {displayPhone}
          </p>
        </div>
      </div>

      {editing && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <p style={{ color: '#9CA3AF', fontSize: 11 }}>点击头像上传新图片（最大 5MB）</p>
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

// ====== 账号类型 Section (媒体运营场景) ======

function AccountTypeSection() {
  const { showToast } = useToast();
  const { accountType, setAccountType } = useAccountType();
  const [savingId, setSavingId] = useState<AccountTypeId | null>(null);

  const handleSelect = async (id: AccountTypeId) => {
    if (id === accountType || savingId) return;
    setSavingId(id);
    const result = await setAccountType(id);
    setSavingId(null);
    if (result.ok) {
      const preset = ACCOUNT_TYPE_PRESETS.find((p) => p.id === id);
      showToast(`已切换到「${preset?.label}」,AI 创作中心推荐组合已更新`, 'success');
    } else {
      showToast(result.error || '切换失败', 'error');
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(244,114,182,0.2)', border: '1px solid rgba(244,114,182,0.4)' }}
        >
          <Sparkles size={16} color="#F9A8D4" />
        </div>
        <div>
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>账号类型</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>选择最贴近的场景,AI 创作中心会推荐对应视频组合</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {ACCOUNT_TYPE_PRESETS.map((preset) => {
          const selected = preset.id === accountType;
          const saving = savingId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset.id)}
              disabled={!!savingId}
              className="text-left p-3 rounded-2xl transition-all active:scale-[0.98]"
              style={{
                background: selected
                  ? 'linear-gradient(135deg, rgba(244,114,182,0.18), rgba(139,92,246,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: selected
                  ? '1px solid rgba(244,114,182,0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                opacity: savingId && !saving ? 0.5 : 1,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 20 }}>{preset.emoji}</span>
                <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{preset.label}</span>
                {selected && !saving && (
                  <Check size={14} color="#F9A8D4" className="ml-auto" />
                )}
                {saving && (
                  <Loader2 size={14} color="#F9A8D4" className="ml-auto animate-spin" />
                )}
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4 }}>
                {preset.desc}
              </p>
            </button>
          );
        })}
      </div>

      {accountType && (
        <div
          className="mt-3 px-3 py-2 rounded-xl flex items-center gap-2"
          style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.2)' }}
        >
          <Sparkles size={12} color="#F9A8D4" />
          <p style={{ color: '#F9A8D4', fontSize: 11 }}>
            去「AI 创作」看为你推荐的 {ACCOUNT_TYPE_PRESETS.find((p) => p.id === accountType)?.combos.length ?? 0} 套视频组合
          </p>
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
    try {
      const resp = await apiClient.post<{ ok: boolean }>(
        '/user/security?action=change-password',
        { currentPassword: current, newPassword: next }
      );
      if (resp && resp.success) {
        showToast('密码已修改', 'success');
        onClose();
      } else {
        showToast(resp?.error || '修改失败', 'error');
      }
    } catch {
      showToast('网络错误，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
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
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>通知</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>管理发布提醒、热点告警、系统消息</p>
        </div>
        <ChevronRight size={16} color="#9CA3AF" />
      </button>
    </GlassCard>
  );
}

// ====== 数字分身 Section ======

type AvatarInfo = {
  avatarId: string;
  name: string;
  status: 'training' | 'ready' | 'failed';
  coverUrl?: string;
  previewVideoUrl?: string;
  trainedAt: number;
};

const AVATAR_STORAGE_KEY = 'lingji_avatar_info';

function AvatarSection() {
  const { showToast } = useToast();
  const router = useRouter();
  const [info, setInfo] = useState<AvatarInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [name, setName] = useState('');
  const [lookalike, setLookalike] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteAvatar, setShowDeleteAvatar] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (raw) setInfo(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!info || info.status !== 'training' || !info.avatarId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    setPolling(true);
    const tick = async () => {
      try {
        const r = await apiClient.get<{ status: string; coverUrl?: string; previewVideoUrl?: string; error?: string }>(
          `/ai/digital-human/avatar?avatarId=${encodeURIComponent(info.avatarId)}`
        );
        if (cancelled) return;
        const next: AvatarInfo = {
          ...info,
          status: r.data?.status === 'ready' ? 'ready' : r.data?.status === 'failed' ? 'failed' : 'training',
          coverUrl: r.data?.coverUrl ?? info.coverUrl,
          previewVideoUrl: r.data?.previewVideoUrl ?? info.previewVideoUrl,
        };
        setInfo(next);
        localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(next));
        if (next.status === 'training') {
          timer = setTimeout(tick, 8000);
        } else {
          setPolling(false);
          if (next.status === 'ready') showToast('分身训练完成,可用于数字人页生成口播视频', 'success');
          if (next.status === 'failed') showToast('分身训练失败,请检查视频后重试', 'error');
        }
      } catch {
        if (cancelled) return;
        timer = setTimeout(tick, 12000);
      }
    };
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setPolling(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [info?.avatarId, info?.status]);

  const handleSubmit = async () => {
    if (!videoUrl.trim() || !name.trim()) {
      showToast('请填写视频 URL 和分身名称', 'error');
      return;
    }
    if (!/^https?:\/\//.test(videoUrl.trim())) {
      showToast('视频 URL 需为完整 HTTP(S) 链接', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiClient.post<{ avatarId: string; status: string }>('/ai/digital-human/avatar', {
        videoUrl: videoUrl.trim(),
        name: name.trim(),
        lookalike,
      });
      if (!r.data?.avatarId) {
        showToast('训练提交失败', 'error');
        return;
      }
      const next: AvatarInfo = {
        avatarId: r.data.avatarId,
        name: name.trim(),
        status: 'training',
        trainedAt: Date.now(),
      };
      setInfo(next);
      localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(next));
      setVideoUrl('');
      setName('');
      setShowForm(false);
      showToast('分身训练已提交,5-15 分钟完成', 'success');
    } catch (e: any) {
      showToast(e?.message || '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteAvatar(true);
  };

  const confirmDeleteAvatar = () => {
    localStorage.removeItem(AVATAR_STORAGE_KEY);
    setInfo(null);
    showToast('已删除', 'success');
    setShowDeleteAvatar(false);
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(236,72,153,0.2)', border: '1px solid rgba(236,72,153,0.4)' }}
        >
          <UserCircle2 size={16} color="#F9A8D4" />
        </div>
        <div className="flex-1">
          <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>数字分身</p>
          <p style={{ color: '#9CA3AF', fontSize: 11 }}>训练个人形象,一键生成口播视频(需 HEYGEN_API_KEY)</p>
        </div>
        {info && (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.15)' }}
            title="删除分身"
          >
            <Trash2 size={14} color="#FCA5A5" />
          </button>
        )}
      </div>

      {info ? (
        <div
          className="rounded-xl p-3 mb-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>{info.name}</p>
              <p style={{ color: '#9CA3AF', fontSize: 11 }} className="mt-0.5">
                {new Date(info.trainedAt).toLocaleString('zh-CN')}
              </p>
            </div>
            <span
              style={{
                color: info.status === 'ready' ? '#34D399' : info.status === 'failed' ? '#FCA5A5' : '#FBBF24',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 6,
                background: info.status === 'ready' ? 'rgba(52,211,153,0.15)'
                  : info.status === 'failed' ? 'rgba(239,68,68,0.15)'
                  : 'rgba(251,191,36,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {polling && <Loader2 size={10} className="animate-spin" />}
              {info.status === 'ready' ? '已就绪' : info.status === 'failed' ? '训练失败' : '训练中'}
            </span>
          </div>

          {info.coverUrl && (
            <img
              src={info.coverUrl}
              alt={info.name}
              className="w-full rounded-lg mb-2"
              style={{ maxHeight: 160, objectFit: 'cover' }}
            />
          )}

          {info.status === 'ready' && (
            <button
              onClick={() => router.push('/ai/digital-human?avatarId=' + info.avatarId)}
              className="w-full py-2 rounded-lg flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(236,72,153,0.2)', color: '#F9A8D4', fontSize: 13 }}
            >
              <VideoIcon size={14} />
              用此分身生成口播视频
            </button>
          )}
        </div>
      ) : (
        !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3 rounded-lg flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(236,72,153,0.15)', color: '#F9A8D4', fontSize: 13, fontWeight: 500 }}
          >
            <Sparkles size={14} />
            训练我的数字分身
          </button>
        )
      )}

      {showForm && !info && (
        <div className="space-y-3 mt-2">
          <div>
            <label style={{ color: '#9CA3AF', fontSize: 11 }} className="block mb-1">
              分身名称(20 字以内)
            </label>
            <GlassInput
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="例如:创始人小明"
            />
          </div>
          <div>
            <label style={{ color: '#9CA3AF', fontSize: 11 }} className="block mb-1">
              训练视频 URL(5-10 分钟清晰人声,正脸)
            </label>
            <GlassInput
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://..."
            />
            <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-1">
              建议:将视频上传到对象存储后粘贴公网 URL
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={lookalike}
              onChange={(e) => setLookalike(e.target.checked)}
              id="lookalike"
            />
            <label htmlFor="lookalike" style={{ color: '#D1D5DB', fontSize: 12 }}>
              Digital Twin(高级克隆,推荐)
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#9CA3AF', fontSize: 13 }}
            >
              取消
            </button>
            <PrimaryButton onClick={handleSubmit} loading={submitting} className="flex-1">
              开始训练
            </PrimaryButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteAvatar}
        title="删除数字分身"
        message="确认删除当前数字分身?这不影响已生成的视频。"
        confirmLabel="删除"
        danger
        onConfirm={confirmDeleteAvatar}
        onCancel={() => setShowDeleteAvatar(false)}
      />
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
        <AccountTypeSection />
        <AvatarSection />
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

export default function SettingsPageContent() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
