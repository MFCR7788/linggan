'use client';

import { GlassCard } from '@/components/GlassCard';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import type { SlicePoint } from '@/lib/ai/smart-clip-engine';

interface Props {
  slices: SlicePoint[];
  onChange: (slices: SlicePoint[]) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SliceList({ slices, onChange }: Props) {
  const toggleSlice = (index: number) => {
    const updated = slices.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    );
    onChange(updated);
  };

  const updateTitle = (index: number, title: string) => {
    const updated = slices.map((s, i) =>
      i === index ? { ...s, title } : s
    );
    onChange(updated);
  };

  const enabledCount = slices.filter((s) => s.enabled).length;
  const totalDuration = slices
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.end - s.start), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
          切片预览 ({slices.length}个)
        </h3>
        <div className="flex gap-3 text-xs" style={{ color: '#9CA3AF' }}>
          <span>启用 {enabledCount}个</span>
          <span>总时长 {formatTime(totalDuration)}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {slices.map((slice, i) => (
          <GlassCard
            key={slice.id || i}
            className="p-3"
            style={{
              opacity: slice.enabled ? 1 : 0.5,
              borderLeft: slice.enabled
                ? '3px solid rgba(59,130,246,0.6)'
                : '3px solid rgba(107,114,128,0.4)',
            }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleSlice(i)}
                className="p-1 rounded hover:bg-white/10 transition-colors"
              >
                {slice.enabled ? (
                  <ToggleRight size={20} style={{ color: '#3B82F6' }} />
                ) : (
                  <ToggleLeft size={20} style={{ color: '#6B7280' }} />
                )}
              </button>

              <input
                type="text"
                value={slice.title || ''}
                onChange={(e) => updateTitle(i, e.target.value)}
                className="flex-1 px-2 py-1 rounded text-sm bg-transparent border-0 outline-none"
                style={{ color: '#E5E7EB' }}
                placeholder="输入标题..."
              />

              <span className="text-xs font-mono" style={{ color: '#9CA3AF' }}>
                {formatTime(slice.start)} - {formatTime(slice.end)}
              </span>

              <span className="text-xs" style={{ color: '#6B7280' }}>
                ({(slice.end - slice.start).toFixed(1)}s)
              </span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
