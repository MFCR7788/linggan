'use client';

import { useState } from 'react';
import { Wand2, Loader2, CheckCircle2, Download, FolderOpen, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { CREDIT_COSTS } from '@/lib/credit-costs';

export interface VideoHyperFramesPanelProps {
  generateHyperFrames: (params: { script: string; style: 'product' | 'social' | 'slide' }) => Promise<{ videoUrl: string }>;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
}

export function VideoHyperFramesPanel({ generateHyperFrames, setToast }: VideoHyperFramesPanelProps) {
  const [hfScript, setHfScript] = useState('');
  const [hfStyle, setHfStyle] = useState<'product' | 'social' | 'slide'>('product');
  const [hfGenerating, setHfGenerating] = useState(false);
  const [hfVideoUrl, setHfVideoUrl] = useState<string | null>(null);
  const [hfError, setHfError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!hfScript.trim()) {
      setToast({ message: '请输入脚本内容', type: 'error' });
      return;
    }
    setHfGenerating(true);
    setHfError(null);
    setHfVideoUrl(null);
    try {
      const { videoUrl } = await generateHyperFrames({
        script: hfScript.trim(),
        style: hfStyle,
      });
      setHfVideoUrl(videoUrl);
      setToast({ message: '动态图形视频生成完成', type: 'success' });
    } catch (e: any) {
      setHfError(e.message || '生成失败');
      setToast({ message: e.message || '生成失败', type: 'error' });
    } finally {
      setHfGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!hfVideoUrl) return;
    const a = document.createElement('a');
    a.href = hfVideoUrl;
    a.download = `hyperframes_${Date.now()}.mp4`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSave = async () => {
    if (!hfVideoUrl) return;
    try {
      const res = await apiClient.post('/inspiration', {
        type: 'video',
        title: (hfScript || '动态图形').substring(0, 40),
        original_text: hfScript,
        media_urls: [hfVideoUrl],
        source_platform: 'ai_hyperframes',
        tags: ['AI生成', '动态图形'],
      });
      if (res.success) {
        setToast({ message: '已保存到作品', type: 'success' });
      } else {
        setToast({ message: res.error || '保存失败', type: 'error' });
      }
    } catch (e) {
      console.error('[Video] 保存动态图形失败:', e);
      setToast({ message: '保存失败', type: 'error' });
    }
  };

  return (
    <div className="px-4 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <p style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 12, textAlign: 'center', letterSpacing: 2 }}>
        ── 独立功能 ──
      </p>
      <div className="p-4 rounded-2xl" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
        <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
          <span style={{ color: '#A78BFA' }}>动态图形</span> · 文字动画视频
          <span style={{
            background: 'rgba(168,85,247,0.2)', color: '#C4B5FD', fontSize: 9, fontWeight: 700,
            padding: '2px 6px', borderRadius: 6, marginLeft: 8, verticalAlign: 'middle',
          }}>Beta</span>
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
          输入脚本，AI 自动生成 HTML+GSAP 动画并渲染为竖屏视频。适合产品介绍、社交媒体、知识讲解。
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {([
            { key: 'product' as const, label: '产品展示', icon: '✨' },
            { key: 'social' as const, label: '社交媒体', icon: '🔥' },
            { key: 'slide' as const, label: '知识讲解', icon: '📚' },
          ]).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setHfStyle(key)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
              style={{ background: hfStyle === key ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)', border: hfStyle === key ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ color: hfStyle === key ? '#C4B5FD' : '#E5E7EB', fontSize: 10, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
        <textarea value={hfScript} onChange={(e) => setHfScript(e.target.value)}
          placeholder={'输入脚本内容...\nAI 会自动拆分为分镜并生成动画'}
          rows={3}
          className="w-full px-3 py-2 rounded-xl bg-transparent text-xs outline-none resize-none mb-2"
          style={{ color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }} />
        {!hfVideoUrl ? (
          <button onClick={handleGenerate} disabled={hfGenerating || !hfScript.trim()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: hfGenerating ? 'rgba(168,85,247,0.3)' : 'linear-gradient(135deg, #8B5CF6, #A855F7)', color: '#FFFFFF', opacity: (!hfScript.trim() || hfGenerating) ? 0.6 : 1 }}>
            {hfGenerating ? <><Loader2 size={14} className="animate-spin" /> 渲染中...</> : <><Wand2 size={14} /> 生成动态图形 · {CREDIT_COSTS.ai_hyperframes.perVideo} 灵力</>}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <CheckCircle2 size={14} color="#22C55E" /><span style={{ color: '#86EFAC', fontSize: 12 }}>生成完成</span>
            </div>
            <video src={hfVideoUrl} controls playsInline className="w-full rounded-xl" style={{ background: '#000', maxHeight: 240 }} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleDownload} className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93C5FD' }}>
                <Download size={12} /> 下载</button>
              <button onClick={handleSave} className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC' }}>
                <FolderOpen size={12} /> 保存作品</button>
            </div>
          </div>
        )}
        {hfError && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <XCircle size={12} color="#EF4444" /><span style={{ color: '#FCA5A5', fontSize: 11 }}>{hfError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
