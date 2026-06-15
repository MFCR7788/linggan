'use client';

import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Download, ExternalLink } from 'lucide-react';

interface ClipResult {
  videoUrl: string;
  totalDuration: number;
  stats: {
    segmentCount: number;
    storageKey: string;
  };
}

interface SliceResultItem {
  title: string;
  url: string;
  duration: number;
  sizeBytes: number;
}

interface Props {
  direction: 'clip' | 'slice';
  clipResult?: ClipResult;
  sliceResults?: SliceResultItem[];
  onReset: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResultViewer({ direction, clipResult, sliceResults, onReset }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
          处理结果
        </h3>
        <PrimaryButton size="sm" variant="ghost" onClick={onReset}>
          重新编辑
        </PrimaryButton>
      </div>

      {direction === 'clip' && clipResult && (
        <div className="space-y-4">
          <GlassCard className="p-4">
            <video
              src={clipResult.videoUrl}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: 400 }}
            />
            <div className="flex items-center gap-3 mt-3 text-xs" style={{ color: '#9CA3AF' }}>
              <span>总时长: {formatTime(clipResult.totalDuration)}</span>
              <span>分段: {clipResult.stats.segmentCount}段</span>
            </div>
          </GlassCard>

          <div className="flex gap-2">
            <a href={clipResult.videoUrl} download target="_blank" rel="noreferrer">
              <PrimaryButton size="sm" variant="secondary">
                <Download size={14} /> 下载
              </PrimaryButton>
            </a>
            <a href={clipResult.videoUrl} target="_blank" rel="noreferrer">
              <PrimaryButton size="sm" variant="ghost">
                <ExternalLink size={14} /> 新窗口打开
              </PrimaryButton>
            </a>
          </div>
        </div>
      )}

      {direction === 'slice' && sliceResults && sliceResults.length > 0 && (
        <div className="space-y-3">
          {sliceResults.map((item, i) => (
            <GlassCard key={i} className="p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                  {item.title}
                </span>
                <span className="text-xs" style={{ color: '#9CA3AF' }}>
                  {formatTime(item.duration)} · {formatSize(item.sizeBytes)}
                </span>
              </div>
              <video
                src={item.url}
                controls
                className="w-full rounded-lg mt-2"
                style={{ maxHeight: 200 }}
              />
              <div className="flex gap-2 mt-2">
                <a href={item.url} download target="_blank" rel="noreferrer">
                  <PrimaryButton size="sm" variant="secondary">
                    <Download size={12} /> 下载
                  </PrimaryButton>
                </a>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
