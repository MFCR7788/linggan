'use client';

import { GlassCard } from '@/components/GlassCard';

interface HistoryItem {
  id: string;
  title: string;
  time: string;
  videoUrl?: string | null;
}

interface DigitalHumanHistoryPanelProps {
  items: HistoryItem[];
  isLoading: boolean;
}

export function DigitalHumanHistoryPanel({ items, isLoading }: DigitalHumanHistoryPanelProps) {
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
              aspectRatio: '9/16',
            }}
            onClick={() => {
              if (item.videoUrl) window.open(item.videoUrl, '_blank');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {item.videoUrl ? (
              <video src={item.videoUrl} className="w-full h-full object-cover" preload="metadata" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span style={{ fontSize: 32 }}>👤</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
              <p style={{ color: '#E5E7EB', fontSize: 15 }} className="truncate">{item.title}</p>
              <span style={{ color: '#6B7280', fontSize: 13 }}>{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
