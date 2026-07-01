'use client';

import type { HistoryWork } from '@/hooks/use-work-history';

export interface VideoHistoryPanelProps {
  items: HistoryWork[];
  isLoading: boolean;
  onSelect: (item: HistoryWork) => void;
}

export function VideoHistoryPanel({ items, isLoading, onSelect }: VideoHistoryPanelProps) {
  if (isLoading || items.length === 0) return null;

  return (
    <div className="px-4 pb-20">
      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>历史生成</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative rounded-xl overflow-hidden cursor-pointer transition-all"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              aspectRatio: '16/9',
            }}
            onClick={() => onSelect(item)}
          >
            {item.videoUrl ? (
              <video src={item.videoUrl} className="w-full h-full object-cover" preload="metadata" />
            ) : item.imageUrl ? (
              <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span style={{ fontSize: 32 }}>🎬</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
              <p style={{ color: '#E5E7EB', fontSize: 11 }} className="truncate">{item.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
