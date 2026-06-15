'use client';

import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ModeSelector } from './ModeSelector';
import type { ClipMode } from './ModeSelector';
import { Upload, Link } from 'lucide-react';

interface Props {
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  clipMode: ClipMode;
  onClipModeChange: (mode: ClipMode) => void;
  description: string;
  setDescription: (desc: string) => void;
  timeRanges: Array<{ start: number; end: number }>;
  setTimeRanges: (ranges: Array<{ start: number; end: number }>) => void;
  silenceThreshold: number;
  setSilenceThreshold: (v: number) => void;
  minSilenceDuration: number;
  setMinSilenceDuration: (v: number) => void;
  removeFillers: boolean;
  setRemoveFillers: (v: boolean) => void;
  removeRepetition: boolean;
  setRemoveRepetition: (v: boolean) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}

export function ClipTab({
  videoUrl,
  setVideoUrl,
  clipMode,
  onClipModeChange,
  description,
  setDescription,
  timeRanges,
  setTimeRanges,
  silenceThreshold,
  setSilenceThreshold,
  minSilenceDuration,
  setMinSilenceDuration,
  removeFillers,
  setRemoveFillers,
  removeRepetition,
  setRemoveRepetition,
  onAnalyze,
  isAnalyzing,
  uploading,
  onUpload,
}: Props) {
  const addTimeRange = () => {
    setTimeRanges([...timeRanges, { start: 0, end: 10 }]);
  };

  const updateTimeRange = (index: number, field: 'start' | 'end', value: number) => {
    const updated = timeRanges.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    setTimeRanges(updated);
  };

  const removeTimeRange = (index: number) => {
    setTimeRanges(timeRanges.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-medium mb-2" style={{ color: '#E5E7EB' }}>上传视频</h3>
        <p className="text-xs mb-3" style={{ color: '#9CA3AF' }}>
          支持 mp4、mov、avi 格式，最大 500MB
        </p>

        <div className="flex gap-2 mb-3">
          <label className="flex-1">
            <input
              type="file"
              accept="video/mp4,video/mov,video/avi,video/webm,video/mkv,video/flv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
              className="hidden"
            />
            <div
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-sm transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', color: '#9CA3AF' }}
            >
              <Upload size={16} />
              {uploading ? '上传中...' : '选择文件'}
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-xs" style={{ color: '#6B7280' }}>或粘贴链接</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="粘贴视频 URL..."
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
          />
          <button
            className="px-3 py-2 rounded-lg text-sm flex items-center gap-1"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9CA3AF' }}
          >
            <Link size={14} />
          </button>
        </div>
      </GlassCard>

      {/* 模式选择 */}
      <GlassCard className="p-4">
        <ModeSelector
          direction="clip"
          clipMode={clipMode}
          sliceMode="uniform"
          onClipModeChange={onClipModeChange}
          onSliceModeChange={() => {}}
        />

        {/* 按描述 */}
        {clipMode === 'by_description' && (
          <div className="mt-4">
            <label className="text-xs" style={{ color: '#9CA3AF' }}>描述你想要的效果</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：删掉所有客套话，只保留核心观点..."
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
            />
          </div>
        )}

        {/* 按时间 */}
        {clipMode === 'by_time_ranges' && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs" style={{ color: '#9CA3AF' }}>删除时间段</label>
              <button
                onClick={addTimeRange}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}
              >
                + 添加
              </button>
            </div>
            {timeRanges.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={r.start}
                  onChange={(e) => updateTimeRange(i, 'start', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded text-xs"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                  placeholder="开始"
                />
                <span className="text-xs" style={{ color: '#6B7280' }}>-</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={r.end}
                  onChange={(e) => updateTimeRange(i, 'end', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded text-xs"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#E5E7EB' }}
                  placeholder="结束"
                />
                <span className="text-xs" style={{ color: '#6B7280' }}>秒</span>
                <button
                  onClick={() => removeTimeRange(i)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: '#EF4444' }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* auto/silence_only 参数 */}
        {(clipMode === 'auto' || clipMode === 'silence_only') && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs" style={{ color: '#9CA3AF', minWidth: 70 }}>
                静音阈值: {silenceThreshold}dB
              </label>
              <input
                type="range"
                min={-50}
                max={-10}
                step={1}
                value={silenceThreshold}
                onChange={(e) => setSilenceThreshold(parseInt(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs" style={{ color: '#9CA3AF', minWidth: 70 }}>
                最短静音: {minSilenceDuration}s
              </label>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={minSilenceDuration}
                onChange={(e) => setMinSilenceDuration(parseFloat(e.target.value))}
                className="flex-1"
              />
            </div>
            {clipMode === 'auto' && (
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs" style={{ color: '#9CA3AF' }}>
                  <input
                    type="checkbox"
                    checked={removeFillers}
                    onChange={(e) => setRemoveFillers(e.target.checked)}
                  />
                  去除口水词
                </label>
                <label className="flex items-center gap-1.5 text-xs" style={{ color: '#9CA3AF' }}>
                  <input
                    type="checkbox"
                    checked={removeRepetition}
                    onChange={(e) => setRemoveRepetition(e.target.checked)}
                  />
                  去除重复
                </label>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* 分析按钮 */}
      <PrimaryButton
        fullWidth
        loading={isAnalyzing}
        disabled={!videoUrl.trim() || isAnalyzing}
        onClick={onAnalyze}
      >
        开始分析
      </PrimaryButton>
    </div>
  );
}
