'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Upload, Sparkles, Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkHistory } from '@/hooks/use-work-history';
import type { StepWidgetProps } from '../StepWidgetRegistry';

export function AdsStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError, role }: StepWidgetProps) {
  const [productName, setProductName] = useState(handoff.topic || '');
  const [imageUrl, setImageUrl] = useState(handoff.imageUrl || '');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoTriggeredRef = useRef(false);
  const { items: historyItems, isLoading: historyLoading } = useWorkHistory('图片');

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    async function autoRun() {
      const product = (handoff.topic || handoff.text || '').trim();
      const refImage = handoff.imageUrl || '';
      if (!product && !refImage) { onAutoError?.('缺少产品名或图片，无法自动生成广告图'); return; }
      try {
        const sellingPoints = [product || '热门推荐', '限时特惠', '品质保证', '点击了解', '好评如潮'];
        const res = await apiClient.post<{ cells?: Array<{ imageUrl: string }> }>('/ai/ads/grid', {
          product: product || '热门推荐',
          sellingPoints,
          referenceImage: refImage || undefined,
          context: role || '',
        });
        if (!res.success) throw new Error(res.error);
        const urls = (res.data!.cells || []).map((c) => c.imageUrl).filter(Boolean);
        await onComplete({ handoffData: { topic: product, text: handoff.text || '', imageUrl: urls[0] || '' } });
      } catch (e: any) {
        onAutoError?.(e.message || '广告图生成失败');
      }
    }
    autoRun();
  }, [autoExecute, handoff.topic, handoff.text, handoff.imageUrl, onComplete, onAutoError]);

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
        context: role || '',
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

      {/* 历史生成 */}
      {!historyLoading && historyItems.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 8 }}>历史生成</p>
          <div className="grid grid-cols-3 gap-1.5">
            {historyItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { if (item.imageUrl) setImageUrl(item.imageUrl); }}
                className="rounded-lg overflow-hidden transition-all hover:opacity-80"
                style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Sparkles size={16} color="#6B7280" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
