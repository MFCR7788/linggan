'use client';

import { useState } from 'react';
import { Loader2, Upload, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

const ACTIONS: { id: string; label: string; desc: string }[] = [
  { id: 'remove-bg', label: '背景移除', desc: '移除背景保留主体' },
  { id: 'enhance', label: '画质增强', desc: '提升清晰度和色彩' },
  { id: 'expand', label: '智能扩图', desc: '扩展画面周边空间' },
];

export function ImageEditorStepWidget({ handoff, onComplete, isCompleting }: StepWidgetProps) {
  const [imageUrl, setImageUrl] = useState(handoff.imageUrl || '');
  const [urlInput, setUrlInput] = useState(handoff.imageUrl || '');
  const [action, setAction] = useState('remove-bg');
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUrlLoad = () => {
    if (urlInput.trim()) setImageUrl(urlInput.trim());
  };

  const handleProcess = async () => {
    if (!imageUrl) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await apiClient.post<{ url: string }>('/ai/image/edit', { action, imageUrl });
      if (!res.success) throw new Error(res.error);
      setResultUrl(res.data!.url);
    } catch (e: any) {
      setError(e.message || '处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (!resultUrl) return;
    await onComplete({ handoffData: { imageUrl: resultUrl } });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload/inspiration', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      const url = data.data?.media_urls?.[0] || data.data?.thumbnail_url;
      if (url) { setImageUrl(url); setUrlInput(url); }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="粘贴图片 URL 或上传..."
          className="flex-1 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
        />
        <button
          onClick={handleUrlLoad}
          className="px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
        >
          加载
        </button>
        <label
          className="px-3 py-2 rounded-lg text-xs cursor-pointer flex items-center gap-1"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
        >
          <Upload size={12} /> 上传
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {imageUrl && (
        <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', background: 'rgba(0,0,0,0.3)' }}>
          <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
        </div>
      )}

      <div className="flex gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAction(a.id)}
            className="flex-1 py-2 rounded-lg text-center text-xs font-medium transition-all"
            style={{
              background: action === a.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
              border: action === a.id ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: action === a.id ? '#A78BFA' : '#9CA3AF',
            }}
          >
            <p>{a.label}</p>
            <p style={{ fontSize: 9, opacity: 0.6 }}>{a.desc}</p>
          </button>
        ))}
      </div>

      {!resultUrl ? (
        <button
          onClick={handleProcess}
          disabled={!imageUrl || processing || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: imageUrl ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' : 'rgba(255,255,255,0.06)',
            color: imageUrl ? '#FFFFFF' : '#4B5563',
          }}
        >
          {processing ? <Loader2 size={16} className="animate-spin" /> : null}
          {processing ? '处理中...' : '开始处理'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', background: 'rgba(0,0,0,0.3)' }}>
            <img src={resultUrl} alt="Result" className="w-full h-full object-contain" />
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
