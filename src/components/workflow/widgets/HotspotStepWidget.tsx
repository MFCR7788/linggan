'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, ExternalLink, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { StepWidgetProps } from '../StepWidgetRegistry';

interface HotspotItem {
  id: string;
  title: string;
  platform: string;
  original_url?: string;
  ai_summary?: string;
  original_content?: string;
  relevance_score: number;
  importance_level: string;
  captured_at: string;
}

export function HotspotStepWidget({ onComplete, isCompleting }: StepWidgetProps) {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ data: HotspotItem[] }>('/hotspot?limit=15&sortBy=captured_at&sortOrder=desc')
      .then((res) => {
        if (res.success) setHotspots((res.data as unknown as HotspotItem[]) || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (item: HotspotItem) => {
    setSelectedId(item.id === selectedId ? null : item.id);
  };

  const handleComplete = async () => {
    const item = hotspots.find((h) => h.id === selectedId);
    if (!item) return;
    await onComplete({
      handoffData: {
        text: item.ai_summary || item.original_content || item.title,
        topic: item.title,
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin" color="#6B7280" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={14} color="#F59E0B" />
        <span style={{ color: '#9CA3AF', fontSize: 11 }}>选择热点作为创作参考</span>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        {hotspots.length === 0 ? (
          <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center', padding: 24 }}>暂无热点数据</p>
        ) : (
          hotspots.map((item) => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="w-full text-left p-2.5 transition-all"
                style={{
                  background: isSelected ? 'rgba(139,92,246,0.1)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: isSelected ? '2px solid #8B5CF6' : '2px solid transparent',
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="px-1 rounded text-[9px]" style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}>
                    {item.platform}
                  </span>
                  {item.importance_level === 'urgent' && (
                    <span className="px-1 rounded text-[9px]" style={{ background: 'rgba(239,68,68,0.2)', color: '#FCA5A5' }}>紧急</span>
                  )}
                  {isSelected && <Check size={12} color="#A78BFA" className="ml-auto" />}
                </div>
                <p style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 600, lineHeight: 1.3 }} className="line-clamp-1">
                  {item.title}
                </p>
                {item.ai_summary && (
                  <p style={{ color: '#6B7280', fontSize: 10, lineHeight: 1.3, marginTop: 2 }} className="line-clamp-1">
                    {item.ai_summary}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>

      {selectedId && (
        <button
          onClick={handleComplete}
          disabled={isCompleting}
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#FFFFFF' }}
        >
          {isCompleting ? <Loader2 size={16} className="animate-spin" /> : null}
          确认使用此热点
        </button>
      )}

      {error && <p style={{ color: '#FCA5A5', fontSize: 11 }}>{error}</p>}
    </div>
  );
}
