'use client';

import { useState } from 'react';
import { Loader2, Upload, Sparkles, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

export function AdsStepWidget({ handoff, onComplete, isCompleting }: StepWidgetProps) {
  const [productName, setProductName] = useState(handoff.topic || '');
  const [imageUrl, setImageUrl] = useState(handoff.imageUrl || '');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload/inspiration', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      const url = data.data?.media_urls?.[0] || data.data?.thumbnail_url;
      if (url) setImageUrl(url);
    }
  };

  const handleGenerate = async () => {
    if (!productName.trim() && !imageUrl) return;
    setGenerating(true);
    setError(null);
    try {
      const sellingPoints = [productName.trim(), '限时特惠', '品质保证', '点击了解', '好评如潮'];
      const res = await apiClient.post<{ cells?: Array<{ imageUrl: string }> }>('/ai/ads/grid', {
        product: productName.trim(),
        sellingPoints,
        referenceImage: imageUrl || undefined,
      });
      if (!res.success) throw new Error(res.error);
      setResults((res.data!.cells || []).map((c) => c.imageUrl).filter(Boolean));
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = async () => {
    if (!results) return;
    await onComplete({
      handoffData: { topic: productName, text: handoff.text || '', imageUrl: results[0] || '' },
    });
  };

  return (
    <div className="space-y-3">
      <input
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
        placeholder="输入产品名..."
        className="w-full px-3 py-2.5 rounded-lg text-sm"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
      />

      <div className="flex items-center gap-2">
        {imageUrl ? (
          <img src={imageUrl} alt="Product" className="w-16 h-16 rounded-lg object-cover" />
        ) : (
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Upload size={16} color="#6B7280" />
          </div>
        )}
        <label
          className="px-3 py-1.5 rounded-lg text-xs cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}
        >
          {imageUrl ? '换图' : '上传产品图'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {!results ? (
        <button
          onClick={handleGenerate}
          disabled={(!productName.trim() && !imageUrl) || generating || isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{
            background: (productName.trim() || imageUrl) ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'rgba(255,255,255,0.06)',
            color: (productName.trim() || imageUrl) ? '#FFFFFF' : '#4B5563',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? '生成中...' : '生成 9 宫格'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            {results.slice(0, 9).map((url, i) => (
              <div key={i} className="rounded overflow-hidden" style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)' }}>
                <img src={url} alt={`Grid ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <a
              href={results[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
            >
              <Download size={12} /> 查看原图
            </a>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className="flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
            >
              {isCompleting ? <Loader2 size={12} className="animate-spin" /> : null}
              确认使用
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}
    </div>
  );
}
