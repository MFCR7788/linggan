'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Download, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const PRESETS: { id: string; label: string; prompt: string }[] = [
  { id: 'product', label: '产品图', prompt: '电商产品图，干净背景，专业布光，高清摄影' },
  { id: 'poster', label: '海报', prompt: '宣传海报，设计感，视觉冲击力强' },
  { id: 'social', label: '社交媒体封面', prompt: '社交媒体封面图，吸引点击' },
  { id: 'logo', label: 'Logo', prompt: '极简Logo设计' },
];

export function ImageStepWidget({ handoff, onComplete, isCompleting }: StepWidgetProps) {
  const [prompt, setPrompt] = useState(handoff.prompt || handoff.text || '');
  const [preset, setPreset] = useState(handoff.preset || 'product');
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePrompt = preset ? PRESETS.find((p) => p.id === preset)?.prompt || prompt : prompt;

  const handleGenerate = async () => {
    if (!generatePrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ url: string }>('/ai/image', {
        prompt: generatePrompt,
        preset,
        style: handoff.style || '',
      });
      if (!res.success) throw new Error(res.error);
      setResultUrl(res.data!.url);
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = async () => {
    if (!resultUrl) return;
    await onComplete({
      handoffData: { prompt: generatePrompt, imageUrl: resultUrl, topic: handoff.topic || '', style: handoff.style || '' },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPreset(p.id); setPrompt(p.prompt); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: preset === p.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
              border: preset === p.id ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: preset === p.id ? '#A78BFA' : '#9CA3AF',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述你想生成的图片..."
        rows={3}
        className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      {!resultUrl ? (
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: prompt.trim() ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' : 'rgba(255,255,255,0.06)',
            color: prompt.trim() ? '#FFFFFF' : '#4B5563',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? '生成中...' : '生成图片'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)' }}>
            <img src={resultUrl} alt="Generated" className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-2">
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <Download size={12} /> 下载
            </a>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <RefreshCw size={12} /> 重新生成
            </button>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={12} className="animate-spin" /> : '确认使用'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}
    </div>
  );
}
