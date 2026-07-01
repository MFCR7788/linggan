'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, UserCircle2, Sparkles, Check,
  Download, FolderOpen,
} from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

interface DigitalHumanAvatarSectionProps {
  onToast: (message: string, type: 'success' | 'error') => void;
  onDownload?: (url: string) => void;
}

export function DigitalHumanAvatarSection({ onToast, onDownload }: DigitalHumanAvatarSectionProps) {
  const router = useRouter();
  const [avatarInfo, setAvatarInfo] = useState<{ avatarId: string; name: string; status: string } | null>(null);
  const [avatarScript, setAvatarScript] = useState('');
  const [avatarVideoId, setAvatarVideoId] = useState<string | null>(null);
  const [avatarPhase, setAvatarPhase] = useState<'idle' | 'submitting' | 'processing' | 'done' | 'failed'>('idle');
  const [avatarResultUrl, setAvatarResultUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('lingji_avatar_info');
      if (raw) {
        const info = JSON.parse(raw);
        setAvatarInfo({ avatarId: info.avatarId, name: info.name, status: info.status });
      }
    } catch {}
  }, []);

  useEffect(() => {
    return () => { if (avatarPollRef.current) clearInterval(avatarPollRef.current); };
  }, []);

  const handleAvatarSubmit = async () => {
    if (!avatarInfo || avatarInfo.status !== 'ready') {
      onToast('请先在「账号设置」训练就绪一个数字分身', 'error');
      return;
    }
    if (!avatarScript.trim()) { onToast('请填写口播脚本', 'error'); return; }
    if (avatarScript.length > 5000) { onToast('口播脚本不能超过 5000 字', 'error'); return; }
    setAvatarPhase('submitting'); setAvatarError(null);
    try {
      const res = await fetch('/api/ai/digital-human/avatar/video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: avatarInfo.avatarId, script: avatarScript.slice(0, 5000) }),
      });
      const data = await res.json();
      if (!data.success || !data.data?.videoId) {
        setAvatarPhase('failed'); setAvatarError(data.error || '提交失败'); return;
      }
      setAvatarVideoId(data.data.videoId);
      setAvatarPhase('processing');
      avatarPollRef.current = setInterval(pollAvatarStatus, 6000);
    } catch (e: any) { setAvatarPhase('failed'); setAvatarError(e?.message || '网络错误'); }
  };

  const pollAvatarStatus = async () => {
    if (!avatarVideoId) return;
    try {
      const res = await fetch(`/api/ai/digital-human/avatar/video?videoId=${encodeURIComponent(avatarVideoId)}`);
      const data = await res.json();
      const s = data.data;
      if (!s) return;
      if (s.status === 'completed') {
        setAvatarResultUrl(s.videoUrl || null); setAvatarPhase('done');
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
        onToast('🎉 数字分身口播视频生成完成', 'success');
      } else if (s.status === 'failed') {
        setAvatarError(s.error || '生成失败'); setAvatarPhase('failed');
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
      }
    } catch {}
  };

  const handleAvatarSave = async () => {
    if (!avatarResultUrl) return;
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video', title: `数字分身口播 · ${avatarInfo?.name || 'My Avatar'}`,
          media_urls: [avatarResultUrl], tags: ['数字分身', 'HeyGen', 'avatar_video'],
          source_platform: 'ai_digital_human',
        }),
      });
      const data = await res.json();
      onToast(data.success ? '已存入灵感库' : (data.error || '保存失败'), data.success ? 'success' : 'error');
    } catch { onToast('保存失败', 'error'); }
  };

  if (!avatarInfo) {
    return (
      <GlassCard>
        <div className="text-center py-8">
          <UserCircle2 size={48} color="#9CA3AF" className="mx-auto mb-3" />
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }} className="mb-1">还没有训练数字分身</p>
          <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-4">训练 5-10 分钟个人形象视频,即可一键生成口播视频</p>
          <button onClick={() => router.push('/profile/settings')}
            className="px-4 py-2 rounded-lg"
            style={{ background: 'rgba(236,72,153,0.2)', color: '#F9A8D4', fontSize: 13 }}>去训练分身</button>
        </div>
      </GlassCard>
    );
  }

  if (avatarInfo.status !== 'ready') {
    return (
      <GlassCard>
        <div className="text-center py-6">
          <Loader2 size={32} color="#FBBF24" className="mx-auto mb-3 animate-spin" />
          <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }} className="mb-1">{avatarInfo.name} 正在训练中</p>
          <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mb-3">训练完成通常需要 5-15 分钟,请耐心等待</p>
          <button onClick={() => router.push('/profile/settings')} style={{ color: '#67E8F9', fontSize: 12 }}>查看训练进度 →</button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-3">
        <UserCircle2 size={16} color="#F9A8D4" />
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600 }}>分身:{avatarInfo.name}</p>
        <span style={{
          color: '#34D399', fontSize: 11, marginLeft: 'auto',
          padding: '2px 8px', borderRadius: 6,
          background: 'rgba(52,211,153,0.15)',
        }}>● 就绪</span>
      </div>

      <div className="mb-3">
        <label style={{ color: '#9CA3AF', fontSize: 11 }} className="block mb-1.5">
          口播脚本(中英文均可,5000 字以内)
        </label>
        <textarea
          value={avatarScript}
          onChange={(e) => setAvatarScript(e.target.value.slice(0, 5000))}
          rows={5}
          placeholder="大家好,我是 XXX,今天给大家分享..."
          className="w-full px-3 py-2 rounded-lg resize-none"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#FFFFFF', fontSize: 13,
          }}
        />
        <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-1 text-right">
          {avatarScript.length} / 5000
        </p>
      </div>

      <button
        onClick={handleAvatarSubmit}
        disabled={avatarPhase === 'submitting' || avatarPhase === 'processing' || !avatarScript.trim()}
        className="w-full py-3 rounded-lg flex items-center justify-center gap-1.5"
        style={{
          background: (avatarPhase === 'submitting' || avatarPhase === 'processing')
            ? 'rgba(236,72,153,0.3)'
            : 'rgba(236,72,153,0.5)',
          color: '#FFFFFF', fontSize: 14, fontWeight: 600,
          opacity: !avatarScript.trim() ? 0.5 : 1,
        }}
      >
        {avatarPhase === 'submitting' && <Loader2 size={14} className="animate-spin" />}
        {avatarPhase === 'processing' && <><Loader2 size={14} className="animate-spin" /> 渲染中...</>}
        {(avatarPhase === 'idle' || avatarPhase === 'failed') && <><Sparkles size={14} /> 生成口播视频</>}
        {avatarPhase === 'done' && <><Check size={14} /> 重新生成</>}
      </button>

      {avatarPhase === 'processing' && (
        <p style={{ color: '#FBBF24', fontSize: 11 }} className="mt-2 text-center">
          ⏳ HeyGen 渲染中,通常 1-3 分钟完成
        </p>
      )}

      {avatarError && (
        <p style={{ color: '#FCA5A5', fontSize: 11 }} className="mt-2">
          ❌ {avatarError}
        </p>
      )}

      {avatarResultUrl && (
        <div className="mt-3">
          <video
            src={avatarResultUrl}
            controls
            className="w-full rounded-lg"
            style={{ maxHeight: 320, background: '#000' }}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onDownload?.(avatarResultUrl)}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontSize: 12 }}
            >
              <Download size={12} /> 下载
            </button>
            <button
              onClick={handleAvatarSave}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(6,182,212,0.2)', color: '#67E8F9', fontSize: 12 }}
            >
              <FolderOpen size={12} /> 存灵感库
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
