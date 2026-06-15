'use client';

import { GlassCard } from '@/components/GlassCard';
import { Scissors, Check } from 'lucide-react';
import type { SegmentAnalysis } from '@/lib/ai/smart-clip-engine';

interface Props {
  segments: SegmentAnalysis[];
  onChange: (segments: SegmentAnalysis[]) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SegmentList({ segments, onChange }: Props) {
  const toggleSegment = (index: number) => {
    const updated = segments.map((seg, i) => {
      if (i !== index) return seg;
      return {
        ...seg,
        recommendation: seg.recommendation === 'keep' ? 'cut' as const : 'keep' as const,
        reason: seg.recommendation === 'keep' ? '手动标记删除' : '手动保留',
      };
    });
    onChange(updated);
  };

  const keepCount = segments.filter((s) => s.recommendation === 'keep').length;
  const cutCount = segments.filter((s) => s.recommendation === 'cut').length;
  const totalKeepDuration = segments
    .filter((s) => s.recommendation === 'keep')
    .reduce((sum, s) => sum + (s.end - s.start), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
          分段预览 ({segments.length}段)
        </h3>
        <div className="flex gap-3 text-xs" style={{ color: '#9CA3AF' }}>
          <span style={{ color: '#34D399' }}>保留 {keepCount}段</span>
          <span style={{ color: '#EF4444' }}>删除 {cutCount}段</span>
          <span>保留时长 {formatTime(totalKeepDuration)}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {segments.map((seg, i) => {
          const isKeep = seg.recommendation === 'keep';
          return (
            <GlassCard
              key={i}
              className="p-3"
              style={{
                borderLeft: isKeep
                  ? '3px solid rgba(52,211,153,0.6)'
                  : '3px solid rgba(239,68,68,0.6)',
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleSegment(i)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                  style={{
                    background: isKeep ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)',
                    border: `1px solid ${isKeep ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: isKeep ? '#34D399' : '#EF4444',
                  }}
                >
                  {isKeep ? <Check size={12} /> : <Scissors size={12} />}
                  {isKeep ? '保留' : '删除'}
                </button>

                <span className="text-xs font-mono" style={{ color: '#9CA3AF' }}>
                  {formatTime(seg.start)} - {formatTime(seg.end)}
                </span>

                <span className="text-xs" style={{ color: '#6B7280' }}>
                  ({(seg.end - seg.start).toFixed(1)}s)
                </span>

                {seg.text && (
                  <span className="text-xs truncate flex-1" style={{ color: '#D1D5DB' }}>
                    {seg.text.length > 50 ? seg.text.slice(0, 50) + '...' : seg.text}
                  </span>
                )}
              </div>

              {seg.reason && (
                <div className="text-[11px] mt-1 ml-1" style={{ color: '#6B7280' }}>
                  {seg.reason}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
