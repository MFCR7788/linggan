'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Image as ImageIcon, FileText, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

export function InspirationStepWidget({ handoff, onComplete, isCompleting, autoExecute, onAutoError }: StepWidgetProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const autoTriggeredRef = useRef(false);

  useEffect(() => { if (!autoExecute) { autoTriggeredRef.current = false; } }, [autoExecute]);

  // Auto-execute: wait for items to load, then pick first
  useEffect(() => {
    if (!autoExecute || autoTriggeredRef.current || loading) return;
    autoTriggeredRef.current = true;
    if (items.length === 0) {
      onAutoError?.('素材库为空，请先上传素材');
      return;
    }
    const item = items[0];
    onComplete({
      handoffData: {
        text: item.title || '',
        imageUrl: item.media_urls?.[0] || item.thumbnail_url || '',
        inspirationId: item.id,
      },
      outputContentId: item.id,
    });
  }, [autoExecute, loading, items, onComplete, onAutoError]);

  useEffect(() => {
    apiClient.get<any[]>('/inspiration?limit=20&sortOrder=desc&ns=ai').then((res) => {
      if (res.success) setItems(res.data || []);
      setLoading(false);
    });
  }, []);

  const handleSelect = async (item: any) => {
    setSelectedId(item.id);
    await onComplete({
      handoffData: {
        text: item.title || '',
        imageUrl: item.media_urls?.[0] || item.thumbnail_url || '',
        inspirationId: item.id,
      },
      outputContentId: item.id,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload/inspiration', { method: 'POST', body: formData });
    const data = await res.json();
    setUploading(false);
    if (data.success) {
      setItems((prev) => [data.data, ...prev]);
      setSelectedId(data.data.id);
      await onComplete({
        handoffData: {
          text: data.data.title || '',
          imageUrl: data.data.media_urls?.[0] || data.data.thumbnail_url || '',
          inspirationId: data.data.id,
        },
        outputContentId: data.data.id,
      });
    }
  };

  if (loading) return <Loader2 size={20} className="animate-spin" color="#6B7280" />;

  return (
    <div className="space-y-3">
      <p style={{ color: '#9CA3AF', fontSize: 12 }}>
        从素材库选择已有素材，或上传新素材作为创作起点
      </p>

      <label
        className="block w-full py-2.5 rounded-lg text-center text-xs font-medium cursor-pointer transition-colors"
        style={{
          background: 'rgba(139,92,246,0.1)',
          border: '1px dashed rgba(139,92,246,0.3)',
          color: '#A78BFA',
        }}
      >
        {uploading ? '上传中...' : '+ 上传新素材'}
        <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>

      <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
        {items.map((item) => {
          const thumb = item.thumbnail_url || item.media_urls?.[0];
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              disabled={isCompleting}
              className="relative rounded-lg overflow-hidden transition-all"
              style={{
                aspectRatio: '1',
                background: 'rgba(255,255,255,0.05)',
                border: isSelected ? '2px solid #8B5CF6' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {thumb ? (
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {item.type === 'text' ? <FileText size={24} color="#6B7280" /> : <ImageIcon size={24} color="#6B7280" />}
                </div>
              )}
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.3)' }}>
                  <Check size={20} color="#FFFFFF" />
                </div>
              )}
              <span
                className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] truncate"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#FFFFFF' }}
              >
                {item.title || '未命名'}
              </span>
            </button>
          );
        })}
      </div>
      {items.length === 0 && (
        <p style={{ color: '#4B5563', fontSize: 11, textAlign: 'center' }}>暂无素材，请上传</p>
      )}
    </div>
  );
}
