'use client';
// AI 混剪 — 多素材智能编排 + 合成

import React, { useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassCard } from '@/components/GlassCard';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Upload, GripVertical } from 'lucide-react';
import type { MashupStyle, MashupRatio, BgmStyle } from '@/lib/ai/mashup-engine';

const STYLE_OPTIONS: { value: MashupStyle; label: string }[] = [
  { value: '快节奏', label: '⚡ 快节奏' },
  { value: '舒缓Vlog', label: '🌿 舒缓Vlog' },
  { value: '教程解说', label: '📚 教程解说' },
  { value: '产品开箱', label: '📦 产品开箱' },
];

const RATIO_OPTIONS: { value: MashupRatio; label: string }[] = [
  { value: '9:16', label: '9:16 竖屏' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '1:1', label: '1:1 方形' },
  { value: '3:4', label: '3:4 小红书' },
];

const BGM_OPTIONS: { value: BgmStyle; label: string }[] = [
  { value: 'hype', label: '🔥 潮流' },
  { value: 'tech', label: '💻 科技' },
  { value: 'chill', label: '🌿 舒缓' },
  { value: 'elegant', label: '✨ 优雅' },
  { value: 'energetic', label: '⚡ 活力' },
  { value: 'none', label: '🔇 无BGM' },
];

export default function MashupPageContent() {
  const router = useRouter();
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [goal, setGoal] = useState('');
  const [style, setStyle] = useState<MashupStyle>('快节奏');
  const [ratio, setRatio] = useState<MashupRatio>('9:16');
  const [bgm, setBgm] = useState<BgmStyle | 'auto'>('auto');
  const [targetDuration, setTargetDuration] = useState(30);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');

  const [plan, setPlan] = useState<{
    taskId: string;
    clips: Array<{ index: number; duration: number; width: number; height: number; hasAudio: boolean; videoUrl: string }>;
    plan: {
      arrangements: Array<{ clipIndex: number; startTime: number; duration: number; transition: string; order: number; reasoning?: string }>;
      totalDuration: number; bgmStyle: string; hasSubtitles: boolean; summary: string;
    };
  } | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const addUrl = () => {
    if (urlInput.trim() && !videoUrls.includes(urlInput.trim())) {
      setVideoUrls(prev => [...prev, urlInput.trim()]);
      setUrlInput('');
    }
  };

  const removeUrl = (index: number) => {
    setVideoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `mashup/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(fileName, file, { contentType: file.type || 'video/mp4', upsert: false });

      let url: string;
      if (uploadErr) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
        const data = await res.json();
        if (!data.success) { setError(`上传失败: ${data.error}`); return; }
        url = data.data.url;
      } else {
        const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(fileName);
        url = urlData.publicUrl;
      }
      setVideoUrls(prev => [...prev, url]);
    } catch (e) {
      setError(`上传失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (videoUrls.length < 2) return;
    setIsAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/mashup/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoUrls, goal: goal.trim() || undefined, style, targetDuration }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || '分析失败'); return; }
      setPlan(data.data);
    } catch (e) {
      setError(`分析失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoUrls, goal, style, targetDuration]);

  const handleExecute = useCallback(async () => {
    if (!plan) return;
    setIsExecuting(true);
    setError('');
    try {
      const res = await fetch('/api/mashup/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId: plan.taskId,
          videoUrls,
          arrangements: plan.plan.arrangements,
          ratio,
          bgm: bgm === 'auto' ? plan.plan.bgmStyle : bgm,
        }),
      });
      const data = await res.json();
      if (data.code === 'INSUFFICIENT_CREDITS') {
        setError(`余额不足，需要 ${data.data?.required || 5} 点灵力`);
        return;
      }
      if (!data.success) { setError(data.error || '执行失败'); return; }
      // SSE progress will handle result via EventSource
      setVideoUrl(null); // will be set by SSE
    } catch (e) {
      setError(`执行失败: ${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setIsExecuting(false);
    }
  }, [plan, videoUrls, ratio, bgm]);

  const handleReset = () => {
    setPlan(null); setVideoUrl(null); setError('');
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <TopNav title="AI 混剪" showBack onBack={() => router.push('/ai')} />

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {/* 素材上传 */}
          {!plan && (
            <>
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>添加素材</h3>
                <div className="flex gap-2 mb-3">
                  <label className="flex-1">
                    <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} className="hidden" />
                    <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}>
                      <Upload size={16} /> {uploading ? '上传中...' : '上传视频'}
                    </div>
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                    placeholder="粘贴视频 URL..."
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                  />
                  <button onClick={addUrl} className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}>
                    <Plus size={16} />
                  </button>
                </div>
                {videoUrls.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs" style={{ color: '#9CA3AF' }}>已添加 {videoUrls.length} 段素材</div>
                    {videoUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <GripVertical size={12} style={{ color: '#6B7280' }} />
                        <span className="flex-1 truncate" style={{ color: '#D1D5DB' }}>{url.split('/').pop() || url}</span>
                        <button onClick={() => removeUrl(i)}><Trash2 size={12} style={{ color: '#EF4444' }} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* 参数 */}
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>混剪参数</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs" style={{ color: '#9CA3AF' }}>创作目标</label>
                    <input
                      type="text" value={goal} onChange={(e) => setGoal(e.target.value)}
                      placeholder="例如：30秒快节奏种草视频"
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: '#9CA3AF' }}>目标时长: {targetDuration}秒</label>
                    <input type="range" min={15} max={120} step={5} value={targetDuration} onChange={(e) => setTargetDuration(parseInt(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#9CA3AF' }}>风格</label>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_OPTIONS.map((s) => (
                        <button key={s.value} onClick={() => setStyle(s.value)} className="px-3 py-1.5 rounded-lg text-xs"
                          style={{
                            background: style === s.value ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${style === s.value ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            color: style === s.value ? '#93C5FD' : '#9CA3AF',
                          }}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>

              {error && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>{error}</div>
              )}

              <PrimaryButton fullWidth loading={isAnalyzing} disabled={videoUrls.length < 2} onClick={handleAnalyze}>
                🎬 生成混剪方案
              </PrimaryButton>
            </>
          )}

          {/* 方案预览 */}
          {plan && !videoUrl && (
            <div className="space-y-4">
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>编排方案</h3>
                <div className="text-xs mb-3" style={{ color: '#9CA3AF' }}>{plan.plan.summary}</div>
                <div className="text-xs space-y-1" style={{ color: '#9CA3AF' }}>
                  <span>总时长: {plan.plan.totalDuration.toFixed(0)}s · </span>
                  <span>镜头数: {plan.plan.arrangements.length} · </span>
                  <span>BGM: {plan.plan.bgmStyle}</span>
                </div>
              </GlassCard>

              {/* Timeline */}
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>时间轴</h3>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {plan.plan.arrangements.map((arr, i) => (
                    <div key={i} className="flex-shrink-0 rounded-lg p-2 text-center" style={{
                      background: 'rgba(59,130,246,0.2)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      width: Math.max(60, arr.duration * 8),
                    }}>
                      <div className="text-[10px]" style={{ color: '#9CA3AF' }}>素材{arr.clipIndex}</div>
                      <div className="text-xs font-medium" style={{ color: '#93C5FD' }}>{arr.duration.toFixed(0)}s</div>
                      <div className="text-[10px]" style={{ color: '#6B7280' }}>{arr.transition}</div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* 输出设置 */}
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>输出设置</h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {RATIO_OPTIONS.map((r) => (
                      <button key={r.value} onClick={() => setRatio(r.value)} className="px-3 py-1.5 rounded-lg text-xs"
                        style={{
                          background: ratio === r.value ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${ratio === r.value ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                          color: ratio === r.value ? '#93C5FD' : '#9CA3AF',
                        }}>{r.label}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BGM_OPTIONS.map((b) => (
                      <button key={b.value} onClick={() => setBgm(b.value)} className="px-3 py-1.5 rounded-lg text-xs"
                        style={{
                          background: bgm === b.value ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${bgm === b.value ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                          color: bgm === b.value ? '#93C5FD' : '#9CA3AF',
                        }}>{b.label}</button>
                    ))}
                  </div>
                </div>
              </GlassCard>

              {error && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>{error}</div>
              )}

              <div className="flex gap-2">
                <PrimaryButton variant="ghost" onClick={handleReset} style={{ flex: 1 }}>重新编辑</PrimaryButton>
                <PrimaryButton onClick={handleExecute} loading={isExecuting} style={{ flex: 2 }}>
                  🎬 合成视频 ({plan.plan.arrangements.length}镜头 · {plan.plan.totalDuration.toFixed(0)}s)
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* 结果 */}
          {videoUrl && (
            <div className="space-y-4">
              <GlassCard className="p-4">
                <video src={videoUrl} controls className="w-full rounded-lg" style={{ maxHeight: 400 }} />
                <div className="flex gap-2 mt-3">
                  <a href={videoUrl} download target="_blank" rel="noreferrer" className="flex-1">
                    <PrimaryButton fullWidth size="sm" variant="secondary">下载</PrimaryButton>
                  </a>
                  <PrimaryButton variant="ghost" onClick={handleReset} style={{ flex: 1 }}>重新混剪</PrimaryButton>
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
