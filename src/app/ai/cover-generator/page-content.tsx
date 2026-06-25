'use client';
// AI 封面生成器 — 智能选帧 + 标题 + 模板合成

import React, { useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TopNav } from '@/components/TopNav';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GlassCard } from '@/components/GlassCard';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Download, Upload } from 'lucide-react';
import type { CoverStyle, TitleStyle } from '@/lib/ai/cover-generator';

const COVER_STYLES: { value: CoverStyle; label: string; preview: string }[] = [
  { value: '大字报', label: '大字报', preview: '竖排大字，高对比' },
  { value: '上下分割', label: '上下分割', preview: '上图下标题' },
  { value: '左右分割', label: '左右分割', preview: '左图右标题' },
  { value: '居中贴纸', label: '居中贴纸', preview: '标题叠图上' },
];

const TITLE_STYLES: { value: TitleStyle; label: string }[] = [
  { value: '悬念', label: '🔥 悬念' },
  { value: '数字', label: '📊 数字' },
  { value: '痛点', label: '🎯 痛点' },
  { value: '对比', label: '⚖️ 对比' },
];

export default function CoverGeneratorPageContent() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // 分析结果
  const [keyframes, setKeyframes] = useState<Array<{ time: number; score: number; url: string; sharpness: number; contrast: number; saturation: number }> | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [coverStyle, setCoverStyle] = useState<CoverStyle>('大字报');
  const [titleStyle, setTitleStyle] = useState<TitleStyle>('悬念');
  const [customDescription, setCustomDescription] = useState('');

  // 结果
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `covers/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage
        .from('lingji-media')
        .upload(fileName, file, { contentType: file.type || 'video/mp4', upsert: false });

      if (uploadErr) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
        const data = await res.json();
        if (!data.success) { setError(`上传失败: ${data.error}`); return; }
        setVideoUrl(data.data.url);
      } else {
        const { data: urlData } = supabase.storage.from('lingji-media').getPublicUrl(fileName);
        setVideoUrl(urlData.publicUrl);
      }
    } catch (e) {
      setError(`上传失败，请重试`);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoUrl.trim()) return;
    setIsAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/cover-generator/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          titleStyle,
          description: customDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || '分析失败'); return; }
      setKeyframes(data.data.keyframes);
      setTitles(data.data.titles || []);
    } catch (e) {
      setError(`分析失败，请重试`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [videoUrl, titleStyle, customDescription]);

  const handleGenerate = useCallback(async () => {
    if (!keyframes || !titles.length) return;
    setIsGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/cover-generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          frameUrl: keyframes[selectedFrame]?.url,
          title: titles[selectedTitle] || '精彩内容',
          coverStyle,
        }),
      });
      const data = await res.json();
      if (data.code === 'INSUFFICIENT_CREDITS') {
        setError(`余额不足，需要 ${data.data?.required || 2} 点灵力`);
        return;
      }
      if (!data.success) { setError(data.error || '生成失败'); return; }
      setCoverUrl(data.data.coverUrl);
    } catch (e) {
      setError(`生成失败，请重试`);
    } finally {
      setIsGenerating(false);
    }
  }, [keyframes, selectedFrame, titles, selectedTitle, coverStyle]);

  const handleReset = () => {
    setKeyframes(null); setTitles([]); setCoverUrl(null);
    setSelectedFrame(0); setSelectedTitle(0);
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <TopNav title="封面生成" showBack onBack={() => router.push('/ai')} />

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
          {/* 上传区域 */}
          {!keyframes && (
            <>
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>选择视频</h3>
                <div className="flex gap-2 mb-3">
                  <label className="flex-1">
                    <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} className="hidden" />
                    <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}>
                      <Upload size={16} /> {uploading ? '上传中...' : '选择文件'}
                    </div>
                  </label>
                </div>
                <input
                  type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="或粘贴视频 URL..."
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                />
              </GlassCard>

              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>标题风格</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {TITLE_STYLES.map((s) => (
                    <button key={s.value} onClick={() => setTitleStyle(s.value)} className="px-3 py-1.5 rounded-lg text-xs"
                      style={{
                        background: titleStyle === s.value ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${titleStyle === s.value ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: titleStyle === s.value ? '#93C5FD' : '#9CA3AF',
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text" value={customDescription} onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="视频内容描述（可选，留空则自动生成标题）"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                />
              </GlassCard>

              {error && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>{error}</div>
              )}

              <PrimaryButton fullWidth loading={isAnalyzing} disabled={!videoUrl.trim()} onClick={handleAnalyze}>
                🔍 智能选帧 + 生成标题
              </PrimaryButton>
            </>
          )}

          {/* 预览 + 合成 */}
          {keyframes && !coverUrl && (
            <div className="space-y-4">
              {/* 关键帧 */}
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>选择关键帧</h3>
                <div className="grid grid-cols-3 gap-2">
                  {keyframes.map((kf, i) => (
                    <button key={i} onClick={() => setSelectedFrame(i)} className="rounded-lg overflow-hidden transition-all"
                      style={{ border: selectedFrame === i ? '2px solid #3B82F6' : '2px solid transparent' }}>
                      <img src={kf.url} alt={`帧 ${i + 1}`} className="w-full aspect-[9/16] object-cover" />
                      <div className="text-[10px] py-1 text-center" style={{ background: 'rgba(0,0,0,0.6)', color: '#9CA3AF' }}>
                        {kf.score}分 · 清晰{kf.sharpness}
                      </div>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {/* 标题选择 */}
              {titles.length > 0 && (
                <GlassCard className="p-4">
                  <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>选择标题</h3>
                  <div className="space-y-2">
                    {titles.map((t, i) => (
                      <button key={i} onClick={() => setSelectedTitle(i)} className="w-full text-left px-3 py-2 rounded-lg text-sm"
                        style={{
                          background: selectedTitle === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selectedTitle === i ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          color: selectedTitle === i ? '#93C5FD' : '#D1D5DB',
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* 模板选择 */}
              <GlassCard className="p-4">
                <h3 className="text-sm font-medium mb-3" style={{ color: '#E5E7EB' }}>封面模板</h3>
                <div className="grid grid-cols-2 gap-2">
                  {COVER_STYLES.map((s) => (
                    <button key={s.value} onClick={() => setCoverStyle(s.value)} className="p-3 rounded-lg text-left"
                      style={{
                        background: coverStyle === s.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${coverStyle === s.value ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      <div className="text-sm font-medium" style={{ color: coverStyle === s.value ? '#93C5FD' : '#E5E7EB' }}>{s.label}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#6B7280' }}>{s.preview}</div>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {error && (
                <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>{error}</div>
              )}

              <div className="flex gap-2">
                <PrimaryButton variant="ghost" onClick={handleReset} style={{ flex: 1 }}>重新选帧</PrimaryButton>
                <PrimaryButton onClick={handleGenerate} loading={isGenerating} style={{ flex: 2 }}>🎨 生成封面</PrimaryButton>
              </div>
            </div>
          )}

          {/* 结果 */}
          {coverUrl && (
            <div className="space-y-4">
              <GlassCard className="p-4">
                <img src={coverUrl} alt="封面" className="w-full rounded-lg" />
                <div className="flex gap-2 mt-3">
                  <a href={coverUrl} download target="_blank" rel="noreferrer" className="flex-1">
                    <PrimaryButton fullWidth size="sm" variant="secondary"><Download size={14} /> 下载</PrimaryButton>
                  </a>
                  <PrimaryButton variant="ghost" onClick={handleReset} style={{ flex: 1 }}>重新生成</PrimaryButton>
                </div>
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
